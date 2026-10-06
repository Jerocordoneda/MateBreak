import { assertStagingConfig } from './staging.mjs';
import {isIP}from'node:net';
import { resolveProviderModes, resolveMiCorreoEnvironment } from '../providers.mjs';
export function loadConfig(env = process.env) {
if(env.MP_ACCESS_TOKEN&&env.MERCADOPAGO_ACCESS_TOKEN&&env.MP_ACCESS_TOKEN!==env.MERCADOPAGO_ACCESS_TOKEN)throw Error('Mercado Pago token aliases disagree.');
const production = env.NODE_ENV === 'production';
const port = Number(env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT debe ser un puerto válido entre 1 y 65535.');
const { shippingMode, paymentsMode } = resolveProviderModes(env);
if (env.APP_ENV && !['local','staging','production'].includes(env.APP_ENV)) throw Error('APP_ENV inválido');
if (env.MATEBREAK_STAGING_PERSIST_MOCK === '1' && env.APP_ENV !== 'staging') throw Error('Staging persistence requires APP_ENV=staging');
const stagingTest=env.APP_ENV==='staging'&&env.MATEBREAK_STAGING_MP_TEST==='1';
const allowedTestNames=new Set(['MP_ACCESS_TOKEN','MERCADOPAGO_ACCESS_TOKEN','MERCADOPAGO_WEBHOOK_SECRET','MP_COLLECTOR_ID','MP_ENVIRONMENT','MP_EXPECTED_LIVE_MODE','MP_PUBLIC_KEY']);
if (env.APP_ENV === 'staging' && Object.entries(env).some(([name,value]) => value && /^(MP_|MERCADOPAGO_|RESEND_(API_KEY|WEBHOOK_SECRET)$|EMAIL_ENVELOPE_KEY$|CORREO_MICORREO_(USER|PASSWORD|CUSTOMER_ID)$|SUPABASE_ACCESS_TOKEN$|DATABASE_URL$|POSTGRES_URL$)/.test(name) && !(stagingTest&&allowedTestNames.has(name)))) throw Error('Staging runtime refuses provider/management/database credentials');
if(env.APP_ENV==='staging'&&env.EMAILS_ENABLED==='1')throw Error('Real email transport forbidden in staging');
const config = {
  url: env.SUPABASE_URL,
  publishable: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY,
  secret: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
  origin: env.APP_ORIGIN || (!production ? `http://localhost:${port}` : ''),
  production,
  authRecoveryEnabled:env.AUTH_RECOVERY_ENABLED==='1',
  reconciliationEnabled:env.PAYMENT_RECONCILIATION_ENABLED==='1',
  email:{enabled:env.EMAILS_ENABLED==='1',workerEnabled:env.EMAIL_WORKER_ENABLED==='1',receiptsEnabled:env.EMAIL_RECEIPTS_ENABLED==='1',apiKey:env.RESEND_API_KEY,webhookSecret:env.RESEND_WEBHOOK_SECRET,encryptionKey:env.EMAIL_ENVELOPE_KEY,from:env.RESEND_FROM_EMAIL||'MateBreak <contacto@matebreak.com.ar>',replyTo:env.RESEND_REPLY_TO||'Mate.break32@gmail.com',testRecipient:env.EMAIL_TEST_RECIPIENT||'',eventId:env.EMAIL_TEST_EVENT_ID||null,rolloutAfter:env.EMAIL_ROLLOUT_AFTER||null},
  rateLimitKey:env.RATE_LIMIT_KEY||'',
  trustedProxyAddresses:env.TRUSTED_PROXY_ADDRESSES?env.TRUSTED_PROXY_ADDRESSES.split(','):[],
  staging: env.APP_ENV === 'staging',
  stagingMpTestEnabled:env.MATEBREAK_STAGING_MP_TEST==='1',
  stagingProjectRef: env.SUPABASE_STAGING_PROJECT_REF,
  stagingPersistMock: env.MATEBREAK_STAGING_PERSIST_MOCK === '1',
  localPersistMock: env.MATEBREAK_LOCAL_PERSIST_MOCK === '1',
  localPickupMock: env.MATEBREAK_LOCAL_PICKUP_MOCK === '1',
  shippingMode,
  paymentsMode,
  mockPaymentResult: env.MOCK_PAYMENT_RESULT || 'approved',
  mockOriginPostalCode: env.MOCK_ORIGIN_POSTAL_CODE || '7000',
  wholesaleWhatsapp: env.WHOLESALE_WHATSAPP_NUMBER || '',
  mercadoPago: {
    accessToken: env.MP_ACCESS_TOKEN || env.MERCADOPAGO_ACCESS_TOKEN,
    webhookSecret: env.MERCADOPAGO_WEBHOOK_SECRET,
    collectorId: env.MP_COLLECTOR_ID,
    environment: env.MP_ENVIRONMENT || 'test',
    expectedLiveMode: env.MP_EXPECTED_LIVE_MODE==='true'?true:env.MP_EXPECTED_LIVE_MODE==='false'?false:undefined,
    origin: env.APP_ORIGIN || (!production ? `http://localhost:${port}` : ''),
  },
  correo: {
    environment: resolveMiCorreoEnvironment(env),
    username: env.CORREO_MICORREO_USER,
    password: env.CORREO_MICORREO_PASSWORD,
    customerId: env.CORREO_MICORREO_CUSTOMER_ID,
    originPostalCode: env.CORREO_ORIGIN_POSTAL_CODE,
  },
  approvedRetailProfiles: env.CORREO_APPROVED_RETAIL_PROFILES_JSON ? JSON.parse(env.CORREO_APPROVED_RETAIL_PROFILES_JSON) : [],
  parcelProfiles: env.CORREO_VERIFIED_PARCELS_JSON ? JSON.parse(env.CORREO_VERIFIED_PARCELS_JSON) : {},
};
for (const key of ['url','publishable','secret','origin']) if (!config[key]) throw Error(`Falta configuración ${key}. Completá .env siguiendo .env.example.`);
for(const address of config.trustedProxyAddresses){const [ip,bits,...extra]=address.split('/'),family=isIP(ip);if(!family||extra.length||(bits!==undefined&&(!/^\d+$/.test(bits)||Number(bits)<1||Number(bits)>(family===4?32:128))))throw Error('Trusted proxies must be explicit IP addresses or non-global CIDRs');}
if(config.email.rolloutAfter&&!Number.isFinite(Date.parse(config.email.rolloutAfter)))throw Error('Invalid email rollout cutoff');
if(config.email.testRecipient&&!['mate.break32@gmail.com','jerocordoneda@gmail.com'].includes(config.email.testRecipient.toLowerCase()))throw Error('Unauthorized email test recipient');
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
assertStagingConfig(config);
return { config, port, paymentsMode, shippingMode };
}
