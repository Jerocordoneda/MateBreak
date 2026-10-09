import { createCorreoArgentino } from './shipping/correo-argentino.mjs';
import { createMockShipping } from './shipping/mock.mjs';
import { createMercadoPago } from './payments/mercadopago.mjs';
import { createMockPayment } from './payments/mock.mjs';
import {stagingMpTestAllowed} from './config/staging-mp-test.mjs';

const modes = new Set(['mock', 'real']);

export function resolveMiCorreoEnvironment(env) {
  const current=env.CORREO_MICORREO_ENVIRONMENT,legacy=env.CORREO_ENVIRONMENT;
  if(current&&legacy&&current!==legacy)throw Error('MiCorreo environment variables disagree.');
  const environment=current||legacy||'test';
  if(!['test','production'].includes(environment))throw Error('MiCorreo environment inválido');
  return environment;
}

export function resolveProviderModes(env) {
  const production = env.NODE_ENV === 'production';
  const shippingMode = env.SHIPPING_MODE || 'mock';
  const paymentsMode = env.PAYMENTS_MODE || (production ? 'real' : 'mock');
  if (!modes.has(shippingMode) || !modes.has(paymentsMode))
    throw Error('SHIPPING_MODE y PAYMENTS_MODE deben ser mock o real');
  if (production && (shippingMode === 'mock' || paymentsMode === 'mock'))
    throw Error('Los proveedores mock no se permiten en NODE_ENV=production');
  if(shippingMode==='mock' && paymentsMode==='real' && env.MATEBREAK_STAGING_PERSIST_MOCK!=='0')
    throw Error('Mercado Pago TEST requires explicit MATEBREAK_STAGING_PERSIST_MOCK=0');
  const testConfig={production,staging:env.APP_ENV==='staging',stagingMpTestEnabled:env.MATEBREAK_STAGING_MP_TEST==='1',
    stagingPersistMock:env.MATEBREAK_STAGING_PERSIST_MOCK==='1',localPersistMock:env.MATEBREAK_LOCAL_PERSIST_MOCK==='1',localPickupMock:env.MATEBREAK_LOCAL_PICKUP_MOCK==='1',
    shippingMode,paymentsMode,mercadoPago:{environment:env.MP_ENVIRONMENT,expectedLiveMode:env.MP_EXPECTED_LIVE_MODE==='true'?true:env.MP_EXPECTED_LIVE_MODE==='false'?false:undefined,
    accessToken:env.MP_ACCESS_TOKEN||env.MERCADOPAGO_ACCESS_TOKEN,webhookSecret:env.MERCADOPAGO_WEBHOOK_SECRET,collectorId:env.MP_COLLECTOR_ID}};
  if (shippingMode === 'mock' && paymentsMode === 'real' && !stagingMpTestAllowed(testConfig))
    throw Error('No se puede cobrar de verdad con una tarifa de envío simulada');
  return { shippingMode, paymentsMode };
}

export function createProviders(config, overrides = {}) {
  // Omitted modes preserve createApp's established test-injection contract.
  const shippingMode = config.shippingMode || 'real';
  const paymentsMode = config.paymentsMode || 'real';
  if (!modes.has(shippingMode) || !modes.has(paymentsMode)) throw Error('Modo de proveedor inválido');
  if (config.production && (shippingMode === 'mock' || paymentsMode === 'mock'))
    throw Error('Los proveedores mock no se permiten en producción');
  if (shippingMode === 'mock' && paymentsMode === 'real' && !stagingMpTestAllowed(config))
    throw Error('No se puede cobrar de verdad con una tarifa de envío simulada');

  const shipping = overrides.correo ?? (shippingMode === 'mock'
    ? createMockShipping({ originPostalCode: config.mockOriginPostalCode })
    : createCorreoArgentino(config.correo));
  if (config.shippingMode === 'real' && !shipping.ready)
    throw Error('SHIPPING_MODE=real requiere CORREO_MICORREO_USER, CORREO_MICORREO_PASSWORD, CORREO_MICORREO_CUSTOMER_ID y CORREO_ORIGIN_POSTAL_CODE');
  if (config.production && config.shippingMode === 'real' && shipping.environment !== 'production')
    throw Error('MiCorreo test no se permite en una aplicación de producción');

  const realPayment = overrides.mercadoPago ?? createMercadoPago({ ...config.mercadoPago,
    appEnvironment:config.staging?'staging':config.production?'production':'local',production:config.production,
    requireTestIdentity: stagingMpTestAllowed(config),
    enabled: config.paymentsMode === 'mock' ? false : config.paymentsMode === 'real' ? true : config.mercadoPago?.enabled });
  if (config.paymentsMode === 'real' && !realPayment.ready)
    throw Error('PAYMENTS_MODE=real requiere MP_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET y APP_ORIGIN HTTPS');
  if(stagingMpTestAllowed(config) && (realPayment.environment!=='test' || realPayment.expectedLiveMode!==config.mercadoPago.expectedLiveMode ||
    String(realPayment.collectorId)!==String(config.mercadoPago.collectorId) || typeof realPayment.verifyTestIdentity!=='function'))
    throw Error('Staging Mercado Pago TEST provider contract mismatch');
  const payment = paymentsMode === 'mock'
    ? createMockPayment({ result: config.mockPaymentResult })
    : { ready: realPayment.ready, mock: false,
      async startPayment(order) {
        const preference = await realPayment.createPreference(order);
        return { provider: 'mercadopago', paymentId: preference.id,
          status: 'redirect', redirectUrl: preference.redirectUrl, mock: false };
      } };
  return { shipping, payment, webhook: paymentsMode === 'mock' ? { ready: false } : realPayment,
    shippingMode, paymentsMode, mock: paymentsMode === 'mock' };
}
