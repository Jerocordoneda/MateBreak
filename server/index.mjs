import { createApp } from './app.mjs';
import { resolveProviderModes,resolveMiCorreoEnvironment } from './providers.mjs';
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT debe ser un puerto válido entre 1 y 65535.');
const { shippingMode, paymentsMode } = resolveProviderModes(process.env);
const config = {
  url: process.env.SUPABASE_URL,
  publishable: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  secret: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  origin: process.env.APP_ORIGIN || (!production ? `http://localhost:${port}` : ''),
  production,
  localPersistMock: process.env.MATEBREAK_LOCAL_PERSIST_MOCK === '1',
  localPickupMock: process.env.MATEBREAK_LOCAL_PICKUP_MOCK === '1',
  shippingMode,
  paymentsMode,
  mockPaymentResult: process.env.MOCK_PAYMENT_RESULT || 'approved',
  mockOriginPostalCode: process.env.MOCK_ORIGIN_POSTAL_CODE || '7000',
  mercadoPago: {
    accessToken: process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN,
    webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    origin: process.env.APP_ORIGIN || (!production ? `http://localhost:${port}` : ''),
  },
  correo: {
    environment: resolveMiCorreoEnvironment(process.env),
    username: process.env.CORREO_MICORREO_USER,
    password: process.env.CORREO_MICORREO_PASSWORD,
    customerId: process.env.CORREO_MICORREO_CUSTOMER_ID,
    originPostalCode: process.env.CORREO_ORIGIN_POSTAL_CODE,
  },
  parcelProfiles: process.env.CORREO_VERIFIED_PARCELS_JSON ? JSON.parse(process.env.CORREO_VERIFIED_PARCELS_JSON) : {},
};
for (const key of ['url','publishable','secret','origin']) if (!config[key]) throw Error(`Falta configuración ${key}. Completá .env siguiendo .env.example.`);
if (config.localPersistMock && process.env.MATEBREAK_LOCAL_ONLY !== '1')
  throw Error('MATEBREAK_LOCAL_PERSIST_MOCK requires MATEBREAK_LOCAL_ONLY=1.');
if(config.localPickupMock && process.env.MATEBREAK_LOCAL_ONLY!=='1')throw Error('MATEBREAK_LOCAL_PICKUP_MOCK requires MATEBREAK_LOCAL_ONLY=1.');
if (process.env.MATEBREAK_LOCAL_ONLY === '1') {
  const endpoint = new URL(config.url), appOrigin = new URL(config.origin);
  if (!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname) || endpoint.port !== '54321' ||
      !['localhost','127.0.0.1','[::1]'].includes(appOrigin.hostname) || config.production ||
      shippingMode !== 'mock' || paymentsMode !== 'mock') {
    throw Error('MATEBREAK_LOCAL_ONLY requiere Supabase localhost:54321, APP_ORIGIN local y proveedores mock.');
  }
}
if (production && new URL(config.url).protocol !== 'https:') throw Error('SUPABASE_URL debe usar HTTPS en producción');
const { app, admin } = createApp(config);
const server = app.listen(port, process.env.MATEBREAK_LOCAL_ONLY === '1' ? '127.0.0.1' : undefined,
  () => console.log(`MateBreak: ${config.origin}/ · Shipping ${shippingMode} · Payments ${paymentsMode}`));
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.timeout = 60_000;
let expiring = false;
const expire = async () => {
  if (expiring) return;
  expiring = true;
  try {
    const { error } = await admin.rpc('mb_expirar_reservas');
    if (error) console.error('No se pudieron liberar reservas vencidas:', error.code);
  } catch { console.error('Fallo de conexión al liberar reservas'); }
  finally { expiring = false; }
};
if (paymentsMode === 'real' || config.localPersistMock) {
  await expire();
  setInterval(expire, 60000).unref();
}
