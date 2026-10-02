// Provenance marker emitted by persistedMock's server-side payment confirmation.
// Do not infer simulation from the payment method or current provider mode alone.
export function persistedSimulation(order) {
  const payments=order.pagos || order.pago || [];
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(order.id || '') && Array.isArray(payments) && payments.some(payment =>
    payment.metodo === 'mercadopago' && payment.referencia_externa === `TEST-LOCAL-${order.id}`);
}
