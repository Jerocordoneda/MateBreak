import { createAuthFactory } from './integrations/supabase/auth.mjs';
import { customerRoutes } from './modules/account/customer-routes.mjs';
import { cartRoutes } from './modules/cart/routes.mjs';
import { authRoutes } from './modules/auth/routes.mjs';
import express from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventoryRoutes } from './modules/inventory/routes.mjs';
import { accountRoutes } from './modules/account/routes.mjs';
import { catalogRoutes } from './modules/catalog/routes.mjs';
import { checkoutRoutes } from './checkout/routes.mjs';
import { createMockCheckoutStore } from './checkout/mock-store.mjs';
import { createProviders } from './providers.mjs';
import { paymentRoutes } from './payments/routes.mjs';
import { logisticsAdminRoutes } from './shipping/admin.mjs';
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
  if (config.localPickupMock) {
    const endpoint=new URL(config.url);
    if(config.production||config.shippingMode!=='mock'||config.paymentsMode!=='mock'
      ||endpoint.protocol!=='http:'||endpoint.port!=='54321'||!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname)
      ||!['localhost','127.0.0.1','[::1]'].includes(parsedOrigin.hostname))throw Error('Mock pickup requires local Supabase, local origin and mock providers.');
  }
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 2592000 };
  const admin = overrides.admin ?? createClient(config.url, config.secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const providers = createProviders(config, overrides);
  const mockCheckout = providers.mock && !config.localPersistMock ? createMockCheckoutStore(providers.payment) : null;
  const authFactory = overrides.authFactory ?? createAuthFactory(config, secure);
  app.use(securityMiddleware(config));
  app.get('/healthz', (req, res) => res.set('Cache-Control','no-store').json({status:'ok'}));
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
  authRoutes(app, { admin, config, authFactory, rpc, rotateCart });
  catalogRoutes(app, { admin });
  checkoutRoutes(app, { admin, config, hashToken, correo: providers.shipping, payment: providers.payment, mockCheckout });
  paymentRoutes(app, { admin, mercadoPago: providers.webhook });
  cartRoutes(app, { admin, checked, hashToken, rpc, rotateCart });
  customerRoutes(app, { checked, requireUser, uuid, rpc });
  inventoryRoutes(app, { admin, authFactory });
  logisticsAdminRoutes(app, {admin,authFactory});
  accountRoutes(app, { admin });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta inexistente' }));
  // Explicit static allowlist: never expose the repository, .env or node_modules.
  app.use('/src', express.static(path.join(root, 'src'), { dotfiles: 'deny' }));
  app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(root, 'index.html'), { dotfiles: 'allow' }));
  app.get('/tienda', (req, res) => res.sendFile(path.join(root, 'src/pages/catalogo.html'), { dotfiles: 'allow' }));
  app.get('/carrito', (req, res) => res.sendFile(path.join(root, 'src/pages/tienda.html'), { dotfiles: 'allow' }));
  app.get('/checkout', (req, res) => res.sendFile(path.join(root, 'src/pages/checkout.html'), { dotfiles: 'allow' }));
  app.get('/checkout/resultado', (req, res) => res.sendFile(path.join(root, 'src/pages/checkout-resultado.html'), { dotfiles: 'allow' }));
  app.get('/productos/:slug', (req,res)=>res.sendFile(path.join(root,'src/pages/producto.html'), { dotfiles: 'allow' }));
  app.get('/mi-cuenta', (req, res) => res.sendFile(path.join(root, 'src/pages/cuenta.html'), { dotfiles: 'allow' }));
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
