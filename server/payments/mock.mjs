import { randomUUID } from 'node:crypto';

export function createMockPayment({ result = 'approved' } = {}) {
  if (!['approved', 'rejected', 'pending'].includes(result)) throw Error('MOCK_PAYMENT_RESULT inválido');
  return {
    ready: true,
    mock: true,
    async startPayment({ id, total, currency = 'ARS' }) {
      if (!id || !Number.isFinite(Number(total)) || Number(total) <= 0 || currency !== 'ARS')
        throw Error('Pedido de prueba inválido');
      return { provider: 'mercadopago_mock', paymentId: `TEST-${randomUUID()}`,
        status: result, mock: true };
    },
  };
}
