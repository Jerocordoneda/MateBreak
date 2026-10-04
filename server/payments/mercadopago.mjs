import { createHmac, timingSafeEqual } from 'node:crypto';

const api = 'https://api.mercadopago.com';
export function verifyMercadoPagoSignature({ signature, requestId, dataId, secret, now = Date.now() }) {
  if (![signature,requestId,dataId,secret].every(v=>typeof v==='string'&&v.length>0) || /[;\r\n]/.test(requestId)) return false;
  const entries=signature.split(',').map(part=>part.trim().split('='));
  if(entries.length!==2||entries.some(e=>e.length!==2)||new Set(entries.map(e=>e[0])).size!==2)return false;
  const parts = Object.fromEntries(entries);
  if (!/^\d{10,13}$/.test(parts.ts || '') || !/^[a-f0-9]{64}$/i.test(parts.v1 || '')) return false;
  const timestamp = Number(parts.ts) * (parts.ts.length === 10 ? 1000 : 1);
  if (Math.abs(now - timestamp) > 10 * 60_000) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(parts.v1, 'hex'));
}

export function createMercadoPago({ accessToken, webhookSecret, origin, collectorId, expectedLiveMode, environment='test', enabled = false } = {}, fetcher = fetch) {
  let safeOrigin=false;try{const u=new URL(origin);safeOrigin=u.protocol==='https:'&&u.origin===origin&&!u.username&&!u.password;}catch{}
  if(!['test','production'].includes(environment))throw Error('Ambiente de Mercado Pago inválido');
  if (enabled && (!accessToken || !webhookSecret || !safeOrigin || typeof expectedLiveMode!=='boolean' || !/^\d{1,30}$/.test(String(collectorId||'')))) {
    throw Error('Mercado Pago requiere token, secreto, vendedor y APP_ORIGIN HTTPS');
  }
  const ready = Boolean(enabled && accessToken && webhookSecret && safeOrigin && collectorId);
  async function call(path, options = {}) {
    if (!ready) throw Error('Mercado Pago no está habilitado');
    const response = await fetcher(`${api}${path}`, {
      ...options, headers: { Authorization: `Bearer ${accessToken}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      signal: AbortSignal.timeout(10_000), redirect:'error',
    });
    if (!response.ok) throw Error(`Mercado Pago respondió ${response.status}`);
    return response.json();
  }
  return {
    ready,environment,collectorId,expectedLiveMode,
    verifyWebhook: input => ready && verifyMercadoPagoSignature({ ...input, secret: webhookSecret }),
    async createPreference({ id, total, email, items, expiresAt }) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !Number.isFinite(total) || total <= 0 || !Number.isSafeInteger(Math.round(total*100)) || Math.abs(total*100-Math.round(total*100))>0.00001 || !Array.isArray(items) || items.length<1 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email||'') || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt)<=Date.now()) throw Error('Pedido inválido');
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
      // Current Checkout Pro test-user flows also use init_point and the real
      // API host. Account identity/expected live_mode distinguish the contract.
      const redirectUrl=preference.init_point;
      let valid=false;try{const u=new URL(redirectUrl);valid=u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&u.hostname==='www.mercadopago.com.ar';}catch{}
      if (typeof preference.id!=='string'||!preference.id||!valid) throw Error('Mercado Pago no devolvió una preferencia válida');
      return { id: preference.id, redirectUrl };
    },
    getPayment: id => {
      if (!/^\d{1,30}$/.test(String(id))) throw Error('Pago externo inválido');
      return call(`/v1/payments/${id}`);
    },
  };
}
