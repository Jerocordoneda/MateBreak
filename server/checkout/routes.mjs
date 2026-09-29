import { randomBytes } from 'node:crypto';
import { parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { calculateTotals, shippingProgress, validateRecipient } from './policy.mjs';
import { transferInstructions } from '../payments/transferencia.mjs';
import { accountRole } from '../account.mjs';
import { planPackages, quotePackages } from '../shipping/packaging.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function checkoutRoutes(app, { admin, config, hashToken, correo, mercadoPago }) {
  const directCookie = config.origin.startsWith('https:') ? '__Host-mb_direct' : 'mb_direct';
  const directToken = req => parseCookieHeader(req.headers.cookie || '').find(cookie => cookie.name === directCookie)?.value;
  const tokenFor = req => req.query.directa === '1' || req.body?.directa === true ? directToken(req) : req.cartToken;
  const requireUser = req => { if (!req.user) throw fail(401, 'Iniciá sesión para continuar'); return req.user.id; };
  const rpc = async (name, args) => {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw fail(error.code === '42501' ? 403 : 409, error.code === 'P0001' ? error.message : 'No se pudo completar la compra');
    return data;
  };
  const cart = async req => {
    const token = tokenFor(req);
    if (!/^[a-f0-9]{64}$/.test(token || '')) throw fail(400, 'No hay una compra directa activa');
    return rpc('mb_comercio', { p_token_hash: hashToken(token), p_usuario_id: req.user?.id || null, p_accion: 'carrito', p_datos: {} });
  };
  const baseQuote = async id => {
    const { data, error } = await admin.rpc('mb_cotizar_catalogo', { p_carrito_id: id, p_pago: 'mercadopago' });
    if (error) throw fail(503, 'No se pudo recalcular el pedido');
    return data;
  };
  const packagesFor = async selection => {
    if (!selection.items?.length) return null;
    const ids = [...new Set(selection.items.map(item => String(item.producto_id)))];
    const { data, error } = await admin.from('producto')
      .select('id_producto,tipo,catalogo_producto_categoria(catalogo_categoria(slug))').in('id_producto', ids);
    if (error) throw fail(503, 'No se pudo determinar el embalaje');
    return planPackages(selection.items, data.map(product => ({
      id: product.id_producto, tipo: product.tipo,
      categorias: product.catalogo_producto_categoria.map(link => link.catalogo_categoria.slug),
    })), config.parcelProfiles);
  };

  app.post('/api/compra-directa', async (req, res) => {
    const { variante_id, cantidad, personalizacion = '' } = req.body || {};
    if (!/^[1-9]\d{0,18}$/.test(String(variante_id)) || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99 ||
      typeof personalizacion !== 'string' || personalizacion.length > 1000) throw fail(400, 'Producto o cantidad inválidos');
    // A fresh, independent cart credential preserves the ordinary cart.
    const token = randomBytes(32).toString('hex');
    const selection = await rpc('mb_comercio', { p_token_hash: hashToken(token), p_usuario_id: req.user?.id || null,
      p_accion: 'variante', p_datos: { variante_id, cantidad, personalizacion } });
    if (selection.requiere_confirmacion_catalogo) throw fail(409, 'La variante no está disponible para comprar');
    res.append('Set-Cookie', serializeCookieHeader(directCookie, token, { httpOnly: true, secure: config.origin.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 3600 }));
    res.status(201).json({ next: '/checkout?directa=1' });
  });

  app.get('/api/checkout/contexto', async (req, res) => {
    const selection = await cart(req);
    const quote = selection.items?.length ? await baseQuote(selection.id) : { items: [], subtotal: 0, moneda: 'ARS' };
    const { data: payments, error: paymentError } = await admin.from('metodo_pago').select('codigo,nombre,activo').in('codigo', ['transferencia','mercadopago']);
    const { data: deliveries, error: deliveryError } = await admin.from('metodo_envio').select('codigo,nombre,activo').in('codigo', ['retiro','correo_domicilio','correo_sucursal']);
    if (paymentError || deliveryError) throw fail(503, 'No se pudieron consultar los medios disponibles');
    const packages = correo.ready && deliveries.some(delivery => delivery.activo && delivery.codigo === 'correo_domicilio')
      ? await packagesFor(selection) : null;
    res.json({ cart: selection, quote, progress: shippingProgress(quote.subtotal),
      payments: payments.map(p => ({ ...p, activo: p.activo && (p.codigo !== 'mercadopago' || mercadoPago.ready) })),
      deliveries: deliveries.map(d => ({ ...d, activo: d.activo && d.codigo !== 'correo_sucursal' &&
        (d.codigo === 'retiro' || (correo.ready && Boolean(packages))) })),
      user: req.user ? { email: req.user.email } : null });
  });

  app.post('/api/checkout/cotizar-envio', async (req, res) => {
    const userId = requireUser(req), recipient = validateRecipient(req.body?.destinatario);
    if (!correo.ready) throw fail(503, 'Correo Argentino todavía no está configurado');
    const mode = req.body?.modalidad;
    if (!['correo_domicilio','correo_sucursal'].includes(mode)) throw fail(400, 'Modalidad inválida');
    let pickupPoint = null;
    if (mode === 'correo_sucursal') {
      const provinceCode = req.body?.provincia_codigo, agencyCode = req.body?.punto_codigo;
      if (!/^[A-Z]$/.test(provinceCode || '') || !/^[A-Z0-9]{2,20}$/.test(agencyCode || '')) throw fail(400, 'Sucursal inválida');
      const agencies = await correo.agencies(provinceCode);
      const agency = agencies.find(item => item.code === agencyCode);
      if (!agency) throw fail(400, 'La sucursal no está habilitada por Correo Argentino');
      pickupPoint = { code: agency.code, name: agency.name, address: agency.location?.address || null };
    }
    const selection = await cart(req);
    if (!selection.items?.length) throw fail(400, 'La selección está vacía');
    const packages = await packagesFor(selection);
    if (!packages) throw fail(503, 'No hay una regla de embalaje para toda la selección');
    const rates = await quotePackages(correo, { destinationPostalCode: recipient.codigo_postal,
      deliveryType: mode === 'correo_domicilio' ? 'D' : 'S', packages });
    if (!rates.length) throw fail(503, 'Correo Argentino no devolvió una tarifa válida');
    const quote = await baseQuote(selection.id);
    const options = [];
    for (const rate of rates) {
      const validTo = new Date(Math.min(Date.parse(rate.validTo) || 0, Date.now() + 15 * 60_000));
      if (validTo <= new Date()) continue;
      const { data, error } = await admin.from('checkout_cotizacion_envio').insert({
        carrito_id: selection.id, usuario_id: userId, destinatario: recipient, modalidad: mode,
        punto: pickupPoint, proveedor: 'correo_argentino', servicio: rate.service,
        costo_transportista: rate.carrierCost, valido_hasta: validTo.toISOString(),
      }).select('id').single();
      if (error) throw fail(503, 'No se pudo guardar la cotización');
      const totals = calculateTotals({ merchandiseSubtotal: quote.subtotal, carrierCost: rate.carrierCost, method: 'mercadopago' });
      options.push({ id: data.id, name: rate.name, service: rate.service, packageCount: rate.packageCount,
        customerShippingCost: totals.customerShippingCost, total: totals.total, currency: 'ARS' });
    }
    if (!options.length) throw fail(503, 'Las tarifas de Correo Argentino vencieron');
    res.json(options);
  });

  app.get('/api/checkout/sucursales', async (req, res) => {
    if (!correo.ready) throw fail(503, 'Correo Argentino todavía no está configurado');
    if (!/^[A-Z]$/.test(req.query.provincia || '')) throw fail(400, 'Provincia inválida');
    const agencies = await correo.agencies(req.query.provincia);
    res.json(agencies.map(agency => ({ code: agency.code, name: agency.name, address: agency.location?.address || null })));
  });

  app.post('/api/checkout/pedidos', async (req, res) => {
    const userId = requireUser(req), recipient = validateRecipient(req.body?.destinatario);
    const { idempotencia, pago, envio, cotizacion_id, directa = false } = req.body || {};
    if (!uuid(idempotencia) || !['transferencia','mercadopago'].includes(pago) ||
      !['retiro','correo_domicilio','correo_sucursal'].includes(envio) ||
      (envio !== 'retiro' && !uuid(cotizacion_id))) throw fail(400, 'Datos de compra inválidos');
    if (pago === 'mercadopago' && !mercadoPago.ready) throw fail(503, 'Mercado Pago todavía no está habilitado');
    if (envio !== 'retiro' && !correo.ready) throw fail(503, 'Correo Argentino todavía no está habilitado');
    const token = tokenFor(req);
    if (!/^[a-f0-9]{64}$/.test(token || '')) throw fail(400, 'La sesión de compra venció');
    const order = await rpc('mb_checkout_minorista', { p_token_hash: hashToken(token), p_usuario_id: userId,
      p_datos: { idempotencia, pago, envio, cotizacion_id, destinatario: recipient } });
    if (pago === 'transferencia') return res.status(201).json({ order, instructions: transferInstructions() });
    const claim = await admin.from('mercadopago_intento').insert({ pedido_id: order.id, estado: 'creando' });
    if (claim.error) {
      if (claim.error.code !== '23505') throw fail(503, 'No se pudo preparar el pago');
      const { data: previous, error: previousError } = await admin.from('mercadopago_intento').select('estado,redireccion').eq('pedido_id', order.id).single();
      if (previousError) throw fail(503, 'No se pudo consultar el intento de pago');
      if (previous.estado === 'listo' && previous.redireccion) return res.status(200).json({ order, redirectUrl: previous.redireccion });
      throw fail(409, 'El pago ya se está preparando. Reintentá en unos segundos');
    }
    try {
      const { data: orderItems, error: itemsError } = await admin.from('pedido_item')
        .select('producto_id,variante_id,nombre,cantidad').eq('pedido_id', order.id);
      if (itemsError || !orderItems?.length) throw Error('Pedido sin líneas verificables');
      const preference = await mercadoPago.createPreference({ id: order.id, total: Number(order.total), email: recipient.email,
        items: orderItems, expiresAt: order.reserva_hasta });
      const { error: savedError } = await admin.from('mercadopago_intento').update({ estado: 'listo', preferencia_id: preference.id,
        redireccion: preference.redirectUrl }).eq('pedido_id', order.id).eq('estado', 'creando');
      if (savedError) throw Error('No se pudo guardar la preferencia');
      return res.status(201).json({ order, redirectUrl: preference.redirectUrl });
    } catch (error) {
      // Provider errors release the whole reservation through the existing
      // cancellation RPC. A network crash still has the one-hour expiry job.
      await admin.from('mercadopago_intento').update({ estado: 'fallido' }).eq('pedido_id', order.id);
      await rpc('mb_comercio', { p_token_hash: '0'.repeat(64), p_usuario_id: userId, p_accion: 'cancelar', p_datos: { id: order.id } });
      throw fail(503, 'No se pudo iniciar Mercado Pago; liberamos la reserva');
    }
  });

  app.get('/api/checkout/pedidos/:id', async (req, res) => {
    const userId = requireUser(req);
    if (!uuid(req.params.id)) throw fail(400, 'Pedido inválido');
    const { data, error } = await admin.from('pedido').select('id,estado,total,moneda,subtotal_mercaderia,descuento_productos,costo_envio,reserva_hasta,creado_en,pago(metodo,estado)').eq('id', req.params.id).eq('usuario_id', userId).maybeSingle();
    if (error) throw fail(503, 'No se pudo consultar el pedido');
    if (!data) throw fail(404, 'Pedido no encontrado');
    let externalPaymentState = null;
    if (data.estado === 'cancelado' && data.pago?.some?.(entry => entry.metodo === 'mercadopago')) {
      const { data: notice, error: noticeError } = await admin.from('pago_webhook_auditoria')
        .select('estado_externo').eq('pedido_id', data.id).order('recibido_en', { ascending: false }).limit(1).maybeSingle();
      if (noticeError) throw fail(503, 'No se pudo consultar el estado del pago');
      externalPaymentState = notice?.estado_externo || null;
    }
    res.json({ ...data, estado_pago_externo: externalPaymentState,
      instructions: data.pago?.some?.(entry => entry.metodo === 'transferencia') ? transferInstructions() : null });
  });

  app.post('/api/admin/transferencias/:id/confirmar', async (req, res) => {
    const userId = requireUser(req);
    if (await accountRole(admin, req.user) !== 'administrador') throw fail(403, 'Solo administración puede confirmar transferencias');
    if (!uuid(req.params.id) || typeof req.body?.referencia !== 'string' || !req.body.referencia.trim() || req.body.referencia.length > 150)
      throw fail(400, 'Pedido o referencia inválidos');
    res.json(await rpc('mb_confirmar_transferencia', { p_actor_id: userId, p_pedido_id: req.params.id, p_referencia: req.body.referencia.trim() }));
  });

  app.get('/api/admin/transferencias', async (req, res) => {
    requireUser(req);
    if (await accountRole(admin, req.user) !== 'administrador') throw fail(403, 'Solo administración puede revisar transferencias');
    const { data, error } = await admin.from('pago').select('pedido_id,importe,pedido!inner(id,estado,reserva_hasta,creado_en,usuario_id)')
      .eq('metodo', 'transferencia').eq('estado', 'pendiente').eq('pedido.estado', 'pendiente_pago').order('creado_en', { foreignTable: 'pedido', ascending: false }).limit(100);
    if (error) throw fail(503, 'No se pudieron consultar las transferencias');
    res.json(data.map(row => ({ id: row.pedido_id, importe: row.importe, reserva_hasta: row.pedido.reserva_hasta,
      creado_en: row.pedido.creado_en })));
  });
}
