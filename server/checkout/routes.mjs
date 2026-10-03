import { persistedMock } from '../config/staging.mjs';
import { randomBytes } from 'node:crypto';
import { parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { calculateTotals, shippingProgress, validateRecipient as validateRecipientFields } from './policy.mjs';
import { transferInstructions } from '../payments/transferencia.mjs';
import { transferAdminRoutes } from '../payments/admin-routes.mjs';
import { packagesFor } from './packaging-service.mjs';
import { quotePackages } from '../shipping/packaging.mjs';
import { shippingSnapshot } from '../shipping/snapshot.mjs';
import { persistedSimulation } from './order-simulation.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const validateRecipient=value=>{try{return validateRecipientFields(value);}catch(error){throw fail(400,error.message);}};
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function checkoutRoutes(app, { admin, config, hashToken, correo, payment, mockCheckout }) {
  const pickupEnabled=Boolean(config.localPickupMock && !config.production && correo.mock && payment.mock);
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
    res.status(201).json({ next: '/carrito?directa=1' });
  });

  app.get('/api/checkout/contexto', async (req, res) => {
    const selection = await cart(req);
    const quote = selection.items?.length ? await baseQuote(selection.id) : { items: [], subtotal: 0, moneda: 'ARS' };
    const { data: payments, error: paymentError } = await admin.from('metodo_pago').select('codigo,nombre,activo').in('codigo', ['transferencia','mercadopago']);
    const { data: deliveries, error: deliveryError } = await admin.from('metodo_envio').select('codigo,nombre,activo').in('codigo', ['retiro','correo_domicilio','correo_sucursal']);
    if (paymentError || deliveryError) throw fail(503, 'No se pudieron consultar los medios disponibles');
    const packages = correo.ready && deliveries.some(delivery => (delivery.activo || correo.mock) && delivery.codigo === 'correo_domicilio')
      ? await packagesFor(selection, { admin, config }) : null;
    res.json({ requiresAuthentication: false, cart: selection, quote, progress: shippingProgress(quote.subtotal), modo_prueba: Boolean(payment.mock), mock_persistente: persistedMock(config),
      payments: payments.map(p => ({ ...p, activo: mockCheckout ? p.codigo === 'mercadopago'
        : p.activo && (p.codigo !== 'mercadopago' || payment.ready) })),
      deliveries: deliveries.map(d => ({ ...d, activo: (d.activo || (mockCheckout && ['retiro','correo_domicilio'].includes(d.codigo)) || (pickupEnabled && !config.localPersistMock && d.codigo==='correo_sucursal')) && (d.codigo !== 'correo_sucursal' || pickupEnabled) &&
        (d.codigo === 'retiro' || (correo.ready && Boolean(packages))) })),
      packaging: { status: packages ? 'automatic' : selection.items?.length ? 'manual' : 'empty' },
      manualQuoteAvailable: Boolean(selection.items?.length && !packages),
      pickupEnabled,
      user: req.user ? { email: req.user.email } : null });
  });

  app.post('/api/checkout/cotizar-envio', async (req, res) => {
    const userId = req.user?.id ?? null, recipient = validateRecipient(req.body?.destinatario);
    if (!correo.ready) throw fail(503, 'Correo Argentino todavía no está configurado');
    const mode = req.body?.modalidad;
    if (!['correo_domicilio','correo_sucursal'].includes(mode)) throw fail(400, 'Modalidad inválida');
    let pickupPoint = null;
    if (mode === 'correo_sucursal') {
      if(!pickupEnabled)throw fail(403,'Entrega a sucursal deshabilitada fuera del modo local/mock explícito');
      const provinceCode = req.body?.provincia_codigo, agencyCode = req.body?.punto_codigo;
      if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ]$/.test(provinceCode || '') || !/^[A-Z0-9]{2,20}$/.test(agencyCode || '')) throw fail(400, 'Sucursal inválida');
      const agencies = await correo.agencies(provinceCode);
      const agency = agencies.find(item => item.code === agencyCode);
      if (!agency) throw fail(400, 'La sucursal no está habilitada por Correo Argentino');
      if (agency.status !== 'ACTIVE' || !agency.services?.pickupAvailability ||
          agency.location?.address?.provinceCode !== provinceCode || !agency.location.address.postalCode)
        throw fail(400, 'La sucursal no está habilitada por Correo Argentino');
      pickupPoint = { code: agency.code, name: agency.name, address: agency.location.address };
    }
    const selection = await cart(req);
    if (!selection.items?.length) throw fail(400, 'La selección está vacía');
    const packages = await packagesFor(selection, { admin, config });
    if (!packages) return res.status(202).json({ status:'manual_quote_required', message:'Vamos a revisar el embalaje y cotizar este pedido manualmente. Tu carrito sigue guardado; no se realizó ningún cobro.', cartId:selection.id });
    const rates = await quotePackages(correo, { destinationPostalCode: pickupPoint?.address.postalCode || recipient.codigo_postal,
      deliveryType: mode === 'correo_domicilio' ? 'D' : 'S', packages });
    if (!rates.length) throw fail(503, 'Correo Argentino no devolvió una tarifa válida');
    const quote = await baseQuote(selection.id);
    const options = [];
    for (const rate of rates) {
      const validTo = new Date(Math.min(Date.parse(rate.validTo) || 0, Date.now() + 15 * 60_000));
      if (validTo <= new Date()) continue;
      let quoteId;
      if (mockCheckout) quoteId = mockCheckout.saveQuote({ owner: hashToken(tokenFor(req)), cart: selection,
        recipient, mode, rate, quote });
      else {
        const snapshot = shippingSnapshot({cart:selection,recipient,deliveryType:mode === 'correo_domicilio' ? 'D' : 'S',
          pickupPoint,rate,environment:correo.mock ? 'mock' : correo.environment,
          originPostalCode:config.correo?.originPostalCode || config.mockOriginPostalCode,
          customerId:config.correo?.customerId,sender:config.correo?.sender});
        const fingerprint = await rpc('mb_shipping_fingerprint', {p_carrito_id:selection.id,p_snapshot:snapshot});
        if (!fingerprint) throw fail(409, 'El carrito cambió; volvé a cotizar');
        const { data, error } = await admin.from('checkout_cotizacion_envio').insert({
          carrito_id: selection.id, usuario_id: userId, destinatario: recipient, modalidad: mode,
          punto: pickupPoint, proveedor: 'correo_argentino', servicio: rate.service,
          costo_transportista: rate.carrierCost, valido_hasta: validTo.toISOString(),snapshot,fingerprint,
        }).select('id').single();
        if (error) throw fail(503, 'No se pudo guardar la cotización');
        quoteId = data.id;
      }
      const totals = calculateTotals({ merchandiseSubtotal: quote.subtotal, carrierCost: rate.carrierCost, method: 'mercadopago' });
      options.push({ id: quoteId, name: rate.name, service: rate.service, packageCount: rate.packageCount,
        customerShippingCost: totals.customerShippingCost, total: totals.total, currency: 'ARS', mock: Boolean(correo.mock) });
    }
    if (!options.length) throw fail(503, 'Las tarifas de Correo Argentino vencieron');
    res.json(options);
  });

  // A downloadable handoff, without persisting PII, reserving stock or charging.
  app.post('/api/checkout/cotizacion-manual', async (req, res) => {
    const recipient = validateRecipient(req.body?.destinatario);
    const selection = await cart(req);
    if (!selection.items?.length) throw fail(400, 'La selección está vacía');
    const quote = await baseQuote(selection.id);
    res.set('Cache-Control','private, no-store').json({status:'manual_quote_required',
      message:'Compartí esta solicitud con MateBreak para acordar el embalaje y el envío. No confirma un pedido ni reserva stock.',
      recipient, items:quote.items, currency:quote.moneda, subtotal:quote.subtotal, createdAt:new Date().toISOString()});
  });

  app.get('/api/checkout/sucursales', async (req, res) => {
    if(!pickupEnabled)throw fail(403,'Selector de sucursal deshabilitado');
    if (!correo.ready) throw fail(503, 'Correo Argentino todavía no está configurado');
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ]$/.test(req.query.provincia || '')) throw fail(400, 'Provincia inválida');
    const agencies = await correo.agencies(req.query.provincia);
    res.json(agencies.map(agency => ({ code: agency.code, name: agency.name, address: agency.location?.address || null })));
  });

  app.post('/api/checkout/pedidos', async (req, res) => {
    const userId = req.user?.id ?? null, recipient = validateRecipient(req.body?.destinatario);
    const { idempotencia, pago, envio, cotizacion_id, directa = false } = req.body || {};
    if (!uuid(idempotencia) || !['transferencia','mercadopago'].includes(pago) ||
      !['retiro','correo_domicilio','correo_sucursal'].includes(envio) ||
      (envio !== 'retiro' && !uuid(cotizacion_id))) throw fail(400, 'Datos de compra inválidos');
    if (pago === 'mercadopago' && !payment.ready) throw fail(503, 'Mercado Pago todavía no está habilitado');
    if (envio !== 'retiro' && !correo.ready) throw fail(503, 'Correo Argentino todavía no está habilitado');
    if(envio==='correo_sucursal' && !pickupEnabled)throw fail(403,'Entrega a sucursal deshabilitada');
    const token = tokenFor(req);
    if (!/^[a-f0-9]{64}$/.test(token || '')) throw fail(400, 'La sesión de compra venció');
    if (mockCheckout) {
      if (pago !== 'mercadopago') throw fail(400, 'Método de prueba no disponible');
      const selection = await cart(req), quote = await baseQuote(selection.id);
      const order = await mockCheckout.createOrder({ owner: hashToken(token), cart: selection, recipient,
        mode: envio, quoteId: cotizacion_id, quote, idempotencia });
      return res.status(201).json({ order: mockCheckout.getOrder(order.id, [hashToken(token)]), mock: true });
    }
    const order = await rpc('mb_checkout_minorista', { p_token_hash: hashToken(token), p_usuario_id: userId,
      p_datos: { idempotencia, pago, envio, cotizacion_id, destinatario: recipient } });
    if (pago === 'transferencia') return res.status(201).json({ order, instructions: transferInstructions() });
    if (order.estado !== 'pendiente_pago') return res.status(200).json({ order });
    if (Date.parse(order.reserva_hasta) <= Date.now()) throw fail(409, 'La reserva venció; consultá el estado del pedido');
    // Explicit local-only persistence: use the real reservation/lifecycle RPCs,
    // then a simulated provider. createApp rejects this mode outside localhost.
    if (persistedMock(config)) {
      const { data: localPayment, error } = await admin.from('pago').select('id,importe,moneda')
        .eq('pedido_id', order.id).eq('metodo','mercadopago').single();
      if (error) throw fail(503, 'No se pudo consultar el pago simulado');
      await rpc('mb_mark_mock_payment',{p_payment_id:localPayment.id});
      const result = await payment.startPayment({ id: order.id, total: Number(localPayment.importe), currency: localPayment.moneda });
      let completed = order;
      if (result.status === 'approved') {
        await rpc('mb_confirmar_pago', {
          p_pago_id: localPayment.id, p_referencia: `TEST-LOCAL-${order.id}`,
          p_importe: Number(localPayment.importe), p_moneda: localPayment.moneda });
        const saved = await admin.from('pedido').select('id,estado,total,moneda,reserva_hasta')
          .eq('id',order.id).single();
        if (saved.error) throw fail(503, 'No se pudo consultar el resultado local');
        completed = saved.data;
      }
      else if (result.status === 'rejected') completed = await rpc('mb_cancelar_pedido_servicio', {p_pedido_id:order.id});
      return res.status(201).json({ order: completed, mock: true, paymentStatus: result.status });
    }
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
      const preference = await payment.startPayment({ id: order.id, total: Number(order.total), email: recipient.email,
        items: orderItems, expiresAt: order.reserva_hasta });
      const { error: savedError } = await admin.from('mercadopago_intento').update({ estado: 'listo', preferencia_id: preference.paymentId,
        redireccion: preference.redirectUrl }).eq('pedido_id', order.id).eq('estado', 'creando');
      if (savedError) throw Error('No se pudo guardar la preferencia');
      return res.status(201).json({ order, redirectUrl: preference.redirectUrl });
    } catch (error) {
      // Provider errors release the whole reservation through the existing
      // cancellation RPC. A network crash still has the one-hour expiry job.
      await admin.from('mercadopago_intento').update({ estado: 'fallido' }).eq('pedido_id', order.id);
      await rpc('mb_cancelar_pedido_servicio', {p_pedido_id:order.id});
      throw fail(503, 'No se pudo iniciar Mercado Pago; liberamos la reserva');
    }
  });

  app.get('/api/checkout/pedidos/:id', async (req, res) => {
    if (mockCheckout) {
      if (!uuid(req.params.id)) throw fail(400, 'Pedido inválido');
      const tokens = [req.hasCart ? req.cartToken : null, directToken(req)].filter(token => /^[a-f0-9]{64}$/.test(token || ''));
      const order = mockCheckout.getOrder(req.params.id, tokens.map(hashToken));
      if (!order) throw fail(404, 'Pedido de prueba no encontrado');
      return res.json(order);
    }
    if (!uuid(req.params.id)) throw fail(400, 'Pedido inválido');
    if (!req.user || req.query.consulta==='carrito') {
      const tokens=[req.hasCart?req.cartToken:null,directToken(req)].filter(t=>/^[a-f0-9]{64}$/.test(t||''));
      if(!tokens.length)throw fail(401,'No se pudo verificar el acceso al pedido');
      for(const token of tokens){
        const result=await admin.rpc('mb_pedido_por_carrito',{p_pedido_id:req.params.id,p_token_hash:hashToken(token),p_usuario_id:req.user?.id||null});
        if(result.error)throw fail(503,'No se pudo consultar el pedido');
        if(result.data){const data=result.data;return res.json({...data,simulacion:persistedSimulation(data)?'persistente':null,
          instructions:(data.pagos||data.pago)?.some(p=>p.metodo==='transferencia')?transferInstructions():null});}
      }
      throw fail(404,'Pedido no encontrado');
    }
    const userId=req.user.id;
    const { data, error } = await admin.from('pedido').select('id,estado,total,moneda,subtotal_mercaderia,descuento_productos,costo_envio,reserva_hasta,creado_en,pago(metodo,estado,referencia_externa)').eq('id', req.params.id).eq('usuario_id', userId).maybeSingle();
    if (error) throw fail(503, 'No se pudo consultar el pedido');
    if (!data) throw fail(404, 'Pedido no encontrado');
    let externalPaymentState = null;
    if (data.estado === 'cancelado' && data.pago?.some?.(entry => entry.metodo === 'mercadopago')) {
      const { data: notice, error: noticeError } = await admin.from('pago_webhook_auditoria')
        .select('estado_externo').eq('pedido_id', data.id).order('recibido_en', { ascending: false }).limit(1).maybeSingle();
      if (noticeError) throw fail(503, 'No se pudo consultar el estado del pago');
      externalPaymentState = notice?.estado_externo || null;
    }
    res.json({ ...data, simulacion: persistedSimulation(data) ? 'persistente' : null, estado_pago_externo: externalPaymentState,
      instructions: data.pago?.some?.(entry => entry.metodo === 'transferencia') ? transferInstructions() : null });
  });

  transferAdminRoutes(app, { admin, requireUser, uuid, rpc });
}
