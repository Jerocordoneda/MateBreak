import { createCorreoArgentino } from './shipping/correo-argentino.mjs';
import { createMockShipping } from './shipping/mock.mjs';
import { createMercadoPago } from './payments/mercadopago.mjs';
import { createMockPayment } from './payments/mock.mjs';

const modes = new Set(['mock', 'real']);

export function resolveProviderModes(env) {
  const production = env.NODE_ENV === 'production';
  const shippingMode = env.SHIPPING_MODE || (production ? 'real' : 'mock');
  const paymentsMode = env.PAYMENTS_MODE || (production ? 'real' : 'mock');
  if (!modes.has(shippingMode) || !modes.has(paymentsMode))
    throw Error('SHIPPING_MODE y PAYMENTS_MODE deben ser mock o real');
  if (production && (shippingMode === 'mock' || paymentsMode === 'mock'))
    throw Error('Los proveedores mock no se permiten en NODE_ENV=production');
  if (shippingMode === 'mock' && paymentsMode === 'real')
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
  if (shippingMode === 'mock' && paymentsMode === 'real')
    throw Error('No se puede cobrar de verdad con una tarifa de envío simulada');

  const shipping = overrides.correo ?? (shippingMode === 'mock'
    ? createMockShipping({ originPostalCode: config.mockOriginPostalCode })
    : createCorreoArgentino(config.correo));
  if (config.shippingMode === 'real' && !shipping.ready)
    throw Error('SHIPPING_MODE=real requiere CORREO_MICORREO_USER, CORREO_MICORREO_PASSWORD, CORREO_MICORREO_CUSTOMER_ID y CORREO_ORIGIN_POSTAL_CODE');

  const realPayment = overrides.mercadoPago ?? createMercadoPago({ ...config.mercadoPago,
    enabled: config.paymentsMode === 'mock' ? false : config.paymentsMode === 'real' ? true : config.mercadoPago?.enabled });
  if (config.paymentsMode === 'real' && !realPayment.ready)
    throw Error('PAYMENTS_MODE=real requiere MP_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET y APP_ORIGIN HTTPS');
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
