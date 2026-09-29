import { createHash, randomUUID } from 'node:crypto';
import { calculateTotals } from './policy.mjs';

const fail = (status, message) => Object.assign(new Error(message), { status });
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Local development only: no pedido, pago, reserva or stock is written to DB.
// State is intentionally ephemeral and disappears when the server restarts.
export function createMockCheckoutStore(payment) {
  const quotes = new Map(), orders = new Map(), attempts = new Map(), inFlight = new Map();
  const prune = () => {
    const now = Date.now();
    for (const [id, quote] of quotes) if (quote.expiresAt <= now) quotes.delete(id);
    for (const [id, order] of orders) if (Date.parse(order.creado_en) < now - 24 * 60 * 60_000) {
      orders.delete(id); attempts.delete(`${order.owner}:${order.idempotencia}`);
    }
  };
  return {
    saveQuote({ owner, cart, recipient, mode, rate, quote }) {
      prune();
      const id = randomUUID(), expiresAt = Math.min(Date.parse(rate.validTo), Date.now() + 15 * 60_000);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw fail(503, 'Tarifa de prueba vencida');
      quotes.set(id, { owner, cartId: cart.id, recipient, mode, carrierCost: rate.carrierCost,
        quoteFingerprint: fingerprint(quote), expiresAt });
      return id;
    },
    async createOrder({ owner, cart, recipient, mode, quoteId, quote, idempotencia }) {
      prune();
      const attemptKey = `${owner}:${idempotencia}`, priorId = attempts.get(attemptKey);
      const requestFingerprint = fingerprint({ cartId: cart.id, recipient, mode });
      if (priorId) {
        const prior = orders.get(priorId);
        if (prior && fingerprint({ cartId: prior.cartId, recipient: prior.destinatario, mode: prior.mode }) === requestFingerprint) return prior;
        throw fail(409, 'La clave de intento ya corresponde a otra compra de prueba');
      }
      const pending = inFlight.get(attemptKey);
      if (pending) {
        if (pending.fingerprint !== requestFingerprint) throw fail(409, 'La clave de intento ya corresponde a otra compra de prueba');
        return pending.promise;
      }
      const promise = (async () => {
        if (!cart.items?.length || cart.requiere_confirmacion_catalogo) throw fail(409, 'La selección ya no está disponible');
        let carrierCost = 0;
        if (mode !== 'retiro') {
          const shipping = quotes.get(quoteId);
          if (!shipping || shipping.owner !== owner || shipping.cartId !== cart.id ||
            shipping.mode !== mode || fingerprint(shipping.recipient) !== fingerprint(recipient) ||
            shipping.quoteFingerprint !== fingerprint(quote)) throw fail(409, 'Volvé a cotizar el envío de prueba');
          carrierCost = shipping.carrierCost;
        }
        const totals = calculateTotals({ merchandiseSubtotal: quote.subtotal, carrierCost, method: 'mercadopago' });
        if (totals.total <= 0 || quote.moneda !== 'ARS') throw fail(409, 'Total de prueba inválido');
        const id = randomUUID();
        const result = await payment.startPayment({ id, total: totals.total, currency: 'ARS', items: quote.items });
        const order = { id, cartId: cart.id, idempotencia, owner, mock: true,
          estado: result.status === 'approved' ? 'pagado' : result.status === 'rejected' ? 'cancelado' : 'pendiente_pago',
          estado_pago_externo: result.status, paymentId: result.paymentId,
          total: totals.total, moneda: 'ARS', subtotal_mercaderia: totals.merchandiseSubtotal,
          descuento_productos: 0, costo_envio: totals.customerShippingCost,
          costo_transportista: totals.carrierCost, destinatario: recipient, mode,
          reserva_hasta: new Date(Date.now() + 60 * 60_000).toISOString(), creado_en: new Date().toISOString() };
        orders.set(id, order); attempts.set(attemptKey, id);
        return order;
      })();
      inFlight.set(attemptKey, { fingerprint: requestFingerprint, promise });
      try { return await promise; }
      finally { inFlight.delete(attemptKey); }
    },
    getOrder(id, owners) {
      prune();
      const order = orders.get(id);
      if (!order || !owners.includes(order.owner)) return null;
      if (order.estado === 'pendiente_pago' && Date.parse(order.reserva_hasta) <= Date.now()) order.estado = 'expirado';
      const { owner, cartId, idempotencia, destinatario, mode, ...publicOrder } = order;
      return publicOrder;
    },
  };
}
