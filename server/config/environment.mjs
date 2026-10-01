import { resolveProviderModes, resolveMiCorreoEnvironment } from '../providers.mjs';
export function loadConfig(env = process.env) {
const production = env.NODE_ENV === 'production';
const port = Number(env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT debe ser un puerto válido entre 1 y 65535.');
const { shippingMode, paymentsMode } = resolveProviderModes(env);
const config = {
  url: env.SUPABASE_URL,
  publishable: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY,
  secret: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
  origin: env.APP_ORIGIN || (!production ? `http://localhost:${port}` : ''),
  production,
  localPersistMock: env.MATEBREAK_LOCAL_PERSIST_MOCK === '1',
  localPickupMock: env.MATEBREAK_LOCAL_PICKUP_MOCK === '1',
  shippingMode,
  paymentsMode,
  mockPaymentResult: env.MOCK_PAYMENT_RESULT || 'approved',
  mockOriginPostalCode: env.MOCK_ORIGIN_POSTAL_CODE || '7000',
  mercadoPago: {
    accessToken: env.MP_ACCESS_TOKEN || env.MERCADOPAGO_ACCESS_TOKEN,
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET,
    origin: env.APP_ORIGIN || (!production ? `http://localhost:${port}` : ''),
  },
  correo: {
    environment: resolveMiCorreoEnvironment(env),
    username: env.CORREO_MICORREO_USER,
    password: env.CORREO_MICORREO_PASSWORD,
    customerId: env.CORREO_MICORREO_CUSTOMER_ID,
    originPostalCode: env.CORREO_ORIGIN_POSTAL_CODE,
  },
  parcelProfiles: env.CORREO_VERIFIED_PARCELS_JSON ? JSON.parse(env.CORREO_VERIFIED_PARCELS_JSON) : {},
};
for (const key of ['url','publishable','secret','origin']) if (!config[key]) throw Error(`Falta configuración ${key}. Completá .env siguiendo .env.example.`);
if (config.localPersistMock && env.MATEBREAK_LOCAL_ONLY !== '1')
  throw Error('MATEBREAK_LOCAL_PERSIST_MOCK requires MATEBREAK_LOCAL_ONLY=1.');
if(config.localPickupMock && env.MATEBREAK_LOCAL_ONLY!=='1')throw Error('MATEBREAK_LOCAL_PICKUP_MOCK requires MATEBREAK_LOCAL_ONLY=1.');
if (env.MATEBREAK_LOCAL_ONLY === '1') {
  const endpoint = new URL(config.url), appOrigin = new URL(config.origin);
  if (!['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname) || endpoint.port !== '54321' ||
      !['localhost','127.0.0.1','[::1]'].includes(appOrigin.hostname) || config.production ||
      shippingMode !== 'mock' || paymentsMode !== 'mock') {
    throw Error('MATEBREAK_LOCAL_ONLY requiere Supabase localhost:54321, APP_ORIGIN local y proveedores mock.');
  }
}
if (production && new URL(config.url).protocol !== 'https:') throw Error('SUPABASE_URL debe usar HTTPS en producción');
return { config, port, paymentsMode, shippingMode };
}
