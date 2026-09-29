import { createHmac, timingSafeEqual } from 'node:crypto';

const api = 'https://api.mercadopago.com';
export function verifyMercadoPagoSignature({ signature, requestId, dataId, secret, now = Date.now() }) {
  if (!signature || !requestId || !dataId || !secret) return false;
  const parts = Object.fromEntries(signature.split(',').map(part => part.trim().split('=')));
  if (!/^\d{10,13}$/.test(parts.ts || '') || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) return false;
  const timestamp = Number(parts.ts) * (parts.ts.length === 10 ? 1000 : 1);
  if (Math.abs(now - timestamp) > 10 * 60_000) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, 'hex'));
}

export function createMercadoPago({ accessToken, webhookSecret, origin, enabled = false } = {}, fetcher = fetch) {
  if (enabled && (!accessToken || !webhookSecret || !origin?.startsWith('https://'))) {
    throw Error('Mercado Pago requiere token, secreto de webhook y APP_ORIGIN HTTPS');
  }
  const ready = Boolean(enabled && accessToken && webhookSecret && origin?.startsWith('https://'));
  async function call(path, options = {}) {
    if (!ready) throw Error('Mercado Pago no está habilitado');
    const response = await fetcher(`${api}${path}`, {
      ...options, headers: { Authorization: `Bearer ${accessToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw Error(`Mercado Pago respondió ${response.status}`);
    return response.json();
  }
  return {
    ready,
    verifyWebhook: input => ready && verifyMercadoPagoSignature({ ...input, secret: webhookSecret }),
    async createPreference({ id, total, email, items, expiresAt }) {
      if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isFinite(total) || total <= 0 || !Array.isArray(items)) throw Error('Pedido inválido');
      // The persisted order total is authoritative. A single line prevents a
      // provider-side rounding difference from changing the payable amount.
      const body = {
        items: [{ id, title: `Pedido MateBreak ${id.slice(0, 8)}`, quantity: 1, currency_id: 'ARS', unit_price: total }],
        external_reference: id, payer: { email },
        back_urls: Object.fromEntries(['success', 'pending', 'failure'].map(key => [key, `${origin}/checkout/resultado?pedido=${id}`])),
        notification_url: `${origin}/api/pagos/mercadopago/webhook`,
        expires: true, expiration_date_to: expiresAt,
        metadata: { internal_order_id: id, product_count: items.length,
          product_ids: items.map(item => String(item.producto_id)).join(',') },
      };
      const preference = await call('/checkout/preferences', { method: 'POST', headers: { 'X-Idempotency-Key': id }, body: JSON.stringify(body) });
      if (!preference.id || !/^https:\/\//.test(preference.init_point || '')) throw Error('Mercado Pago no devolvió una preferencia válida');
      return { id: preference.id, redirectUrl: preference.init_point };
    },
    getPayment: id => {
      if (!/^\d{1,30}$/.test(String(id))) throw Error('Pago externo inválido');
      return call(`/v1/payments/${id}`);
    },
  };
}
