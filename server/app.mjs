import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryRoutes } from './inventory.mjs';
import { accountRole, accountRoutes } from './account.mjs';
import { catalogRoutes } from './catalog.mjs';
import { checkoutRoutes } from './checkout/routes.mjs';
import { createMockCheckoutStore } from './checkout/mock-store.mjs';
import { createProviders } from './providers.mjs';
import { paymentRoutes } from './payments/routes.mjs';
import { securityMiddleware, securityEvent } from './security.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (status, message) => Object.assign(new Error(message), { status });
export const hashToken = value => createHash('sha256').update(value).digest('hex');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function createApp(config, overrides = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  let parsedOrigin;
  try { parsedOrigin = new URL(config.origin); } catch { throw Error('APP_ORIGIN inválido'); }
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== config.origin ||
      parsedOrigin.username || parsedOrigin.password) throw Error('APP_ORIGIN debe ser un origen HTTP(S) sin path ni credenciales');
  const secure = parsedOrigin.protocol === 'https:';
  if (config.production && !secure) throw Error('APP_ORIGIN debe usar HTTPS en produccion');
  if (config.localPersistMock) {
    const endpoint = new URL(config.url);
    if (config.production || config.shippingMode !== 'mock' || config.paymentsMode !== 'mock'
      || endpoint.protocol !== 'http:' || endpoint.port !== '54321'
      || !['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)
      || !['localhost','127.0.0.1','[::1]'].includes(parsedOrigin.hostname))
      throw Error('Persisted mock checkout requires local Supabase and mock providers.');
  }
  const cookieName = secure ? '__Host-mb_cart' : 'mb_cart';
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 2592000 };
  const admin = overrides.admin ?? createClient(config.url, config.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const providers = createProviders(config, overrides);
  const mockCheckout = providers.mock && !config.localPersistMock ? createMockCheckoutStore(providers.payment) : null;
  const authFactory = overrides.authFactory ?? ((req, res) => createServerClient(config.url, config.publishable, {
    cookieOptions: { httpOnly: true, secure, sameSite: 'lax', path: '/' },
    cookies: {
      getAll: () => parseCookieHeader(req.headers.cookie ?? ''),
      setAll: (cookies, headers = {}) => {
        for (const { name, value, options } of cookies) res.append('Set-Cookie', serializeCookieHeader(name, value, { ...options, httpOnly: true, secure, sameSite: 'lax', path: '/' }));
        for (const [key, value] of Object.entries(headers)) res.set(key, value);
      },
    },
  }));
  app.use(securityMiddleware(config));
  app.use('/api', express.json({ limit: '16kb' }));
  app.use('/api', async (req, res, next) => {
    req.auth = authFactory(req, res);
    const { data, error } = await req.auth.auth.getUser();
    req.user = !error ? data?.user : null;
    const existing = parseCookieHeader(req.headers.cookie ?? '').find(c => c.name === cookieName)?.value;
    req.cartToken = /^[a-f0-9]{64}$/.test(existing ?? '') ? existing : randomBytes(32).toString('hex');
    req.hasCart = req.cartToken === existing;
    // Only cart/auth routes set this cookie: parallel catalog requests must not
    // overwrite the initial cart credential with unrelated random values.
    if (req.cartToken !== existing && ((req.path.startsWith('/carrito') && req.path !== '/carrito/resumen') || req.path === '/auth/login')) res.append('Set-Cookie', serializeCookieHeader(cookieName, req.cartToken, cookieOptions));
    next();
  });
  const requireUser = req => { if (!req.user) throw fail(401, 'Iniciá sesión para continuar'); return req.user.id; };
  const rotateCart = (req, res) => {
    req.cartToken = randomBytes(32).toString('hex');
    res.append('Set-Cookie', serializeCookieHeader(cookieName, req.cartToken, cookieOptions));
  };
  const rpc = async (req, action, data = {}) => {
    const result = await admin.rpc('mb_comercio', { p_token_hash: hashToken(req.cartToken), p_usuario_id: req.user?.id ?? null, p_accion: action, p_datos: data });
    if (result.error) throw fail(409, result.error.code === 'P0001' ? result.error.message : 'No se pudo completar la operación');
    return result.data;
  };
  const checked = async query => { const { data, error } = await query; if (error) throw fail(400, 'No se pudo guardar o consultar los datos'); return data; };
  app.get('/api/sesion', async (req, res) => res.json({ usuario: req.user ? { id: req.user.id, email: req.user.email, rol: await accountRole(admin,req.user) } : null }));
  app.post('/api/auth/registro', async (req, res) => {
    const { email, password, nombre } = req.body ?? {};
    if (typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.length > 150) throw fail(400,'Indicá tu nombre y apellido');
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 10 || password.length > 128) throw fail(400, 'Indicá email y contraseña de al menos 10 caracteres');
    // Only display data is accepted. No role or membership is created here.
    const { data, error } = await req.auth.auth.signUp({ email:email.trim().toLowerCase(), password, options: { data:{nombre:nombre.trim()}, emailRedirectTo: config.origin + '/auth/callback' } });
    if (error) throw fail(400, 'No se pudo registrar. Revisá los datos o intentá más tarde.');
    res.json({ sesion_iniciada:!!data?.session, mensaje: 'Si el email puede registrarse, recibirás un enlace para confirmar tu cuenta. Si ya tenés una cuenta, ingresá con tu contraseña.' });
  });
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') throw fail(400, 'Faltan credenciales');
    const { data, error } = await req.auth.auth.signInWithPassword({ email, password });
    if (error) throw fail(401, 'Email o contraseña incorrectos');
    req.user = data.user;
    // Keep the random guest-cart credential so the existing cart is attached.
    // Supabase Auth issues a fresh login session independently of this cookie.
    try { await rpc(req, 'vincular'); }
    catch (error) {
      if (!['Sesion invalida', 'El carrito vencio'].includes(error.message)) throw error;
      rotateCart(req, res); await rpc(req, 'vincular');
    }
    res.json({ usuario: { id: data.user.id, email: data.user.email } });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const { error } = await req.auth.auth.signOut();
    if (error) throw fail(503, 'No se pudo cerrar la sesión. Reintentá.');
    rotateCart(req, res); res.json({ ok: true });
  });
  app.get('/auth/callback', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (typeof req.query.code !== 'string') return res.redirect('/mi-cuenta?auth=error');
    const auth = authFactory(req, res);
    const { error } = await auth.auth.exchangeCodeForSession(req.query.code);
    res.redirect(error ? '/mi-cuenta?auth=error' : '/mi-cuenta');
  });
  catalogRoutes(app, { admin });
  checkoutRoutes(app, { admin, config, hashToken, correo: providers.shipping, payment: providers.payment, mockCheckout });
  paymentRoutes(app, { admin, mercadoPago: providers.webhook });
  app.get('/api/metodos', async (req, res) => {
    const [pagos, envios] = await Promise.all([
      checked(admin.from('metodo_pago').select('codigo,nombre,instrucciones').eq('activo', true)),
      checked(admin.from('metodo_envio').select('codigo,nombre,costo,requiere_direccion').eq('activo', true)),
    ]); res.json({ pagos, envios });
  });
  app.get('/api/carrito/resumen', async (req, res) => {
    if (!req.hasCart) return res.json({cantidad:0});
    const {data,error}=await admin.rpc('mb_carrito_cantidad',{p_token_hash:hashToken(req.cartToken),p_usuario_id:req.user?.id ?? null});
    if (error) throw fail(503,'No se pudo consultar el carrito');
    res.json({cantidad:data});
  });
  app.get('/api/carrito', async (req, res) => {
    let cart;
    try { cart = await rpc(req, 'carrito'); }
    catch (error) {
      if (!['Sesion invalida', 'El carrito vencio'].includes(error.message)) throw error;
      rotateCart(req, res); cart = await rpc(req, 'carrito');
    }
    if (cart.estado === 'convertido') { rotateCart(req, res); cart = await rpc(req, 'carrito'); }
    res.json(cart);
  });
  app.put('/api/carrito/items/:id', async (req, res) => {
    if (!/^[1-9][0-9]{0,18}$/.test(req.params.id) || !Number.isInteger(req.body?.cantidad) || req.body.cantidad < 0 || req.body.cantidad > 99) throw fail(400, 'Producto o cantidad inválidos');
    res.json(await rpc(req, 'cantidad', { producto_id: req.params.id, cantidad: req.body.cantidad }));
  });
  app.put('/api/carrito/variantes/:id', async (req, res) => {
    const {cantidad,personalizacion}=req.body??{};
    if(!/^[1-9][0-9]{0,18}$/.test(req.params.id)||!Number.isInteger(cantidad)||cantidad<0||cantidad>99
      ||(personalizacion!==undefined&&(typeof personalizacion!=='string'||personalizacion.length>1000)))throw fail(400,'Variante, cantidad o personalización inválidas');
    res.json(await rpc(req,'variante',{variante_id:req.params.id,cantidad,...(personalizacion===undefined?{}:{personalizacion})}));
  });
  app.get('/api/perfil', async (req, res) => {
    const profile=await checked(req.auth.from('perfil').select('nombre,telefono').eq('id', requireUser(req)).maybeSingle());
    // Auth metadata is used for display only, never permissions.
    res.json(profile??{nombre:typeof req.user.user_metadata?.nombre==='string'?req.user.user_metadata.nombre.slice(0,150):'',telefono:''});
  });
  app.put('/api/perfil', async (req, res) => {
    const id = requireUser(req); const { nombre, telefono } = req.body ?? {};
    if (typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.length > 150 ||
        typeof telefono !== 'string' || telefono.length > 40) throw fail(400, 'Perfil inválido');
    res.json(await checked(req.auth.from('perfil').upsert({ id, nombre: nombre.trim(), telefono: telefono.trim() }).select('nombre,telefono').single()));
  });
  app.get('/api/direcciones', async (req, res) => res.json(await checked(req.auth.from('direccion').select('*').eq('usuario_id', requireUser(req)).order('creado_en'))));
  const address = body => Object.fromEntries(['destinatario','telefono','calle','ciudad','departamento','codigo_postal','pais','indicaciones'].filter(k => typeof body?.[k] === 'string').map(k => [k, body[k]]));
  app.post('/api/direcciones', async (req, res) => res.status(201).json(await checked(req.auth.from('direccion').insert({ ...address(req.body), usuario_id: requireUser(req) }).select().single())));
  app.put('/api/direcciones/:id', async (req, res) => {
    if (!uuid(req.params.id)) throw fail(400, 'Dirección inválida');
    res.json(await checked(req.auth.from('direccion').update(address(req.body)).eq('id', req.params.id).eq('usuario_id', requireUser(req)).select().single()));
  });
  app.delete('/api/direcciones/:id', async (req, res) => {
    if (!uuid(req.params.id)) throw fail(400, 'Dirección inválida');
    await checked(req.auth.from('direccion').delete().eq('id', req.params.id).eq('usuario_id', requireUser(req))); res.json({ ok: true });
  });
  app.get('/api/pedidos', async (req, res) => { requireUser(req); res.json(await rpc(req, 'pedidos')); });
  app.post('/api/pedidos', (req, res) => res.status(410).json({ error: 'Usá el checkout actual para confirmar tu pedido' }));
  app.post('/api/pedidos/:id/cancelar', async (req, res) => {
    requireUser(req); if (!uuid(req.params.id)) throw fail(400, 'Pedido inválido');
    res.json(await rpc(req, 'cancelar', { id: req.params.id }));
  });
  inventoryRoutes(app, { admin, authFactory });
  accountRoutes(app, { admin });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente' }));
  // Explicit static allowlist: never expose the repository, .env or node_modules.
  app.use('/src', express.static(path.join(root, 'src'), { dotfiles: 'deny' }));
  app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(root, 'index.html')));
  app.get('/tienda', (req, res) => res.sendFile(path.join(root, 'src/pages/catalogo.html')));
  app.get('/carrito', (req, res) => res.sendFile(path.join(root, 'src/pages/tienda.html')));
  app.get('/checkout', (req, res) => res.sendFile(path.join(root, 'src/pages/checkout.html')));
  app.get('/checkout/resultado', (req, res) => res.sendFile(path.join(root, 'src/pages/checkout-resultado.html')));
  app.get('/productos/:slug', (req,res)=>res.sendFile(path.join(root,'src/pages/producto.html')));
  app.get('/mi-cuenta', (req, res) => res.sendFile(path.join(root, 'src/pages/cuenta.html')));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.name === 'MiCorreoError') {
      console.warn(JSON.stringify({provider:'micorreo',endpoint:error.endpoint,status:error.status,
        requestId:req.id,errorType:error.type}));
      return res.status(503).json({error:'No pudimos consultar Correo Argentino. Intentá nuevamente.'});
    }
    if (!error.status || error.status >= 500) securityEvent('SERVER_ERROR', req, { status: error.status ?? 500 });
    res.status(error.status ?? 500).json({ error: error.status ? error.message : 'Error temporal del servidor' });
  });
  return { app, admin };
}
