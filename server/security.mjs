import {publicCspFor} from './security/public-policy.mjs';
import { randomUUID } from 'node:crypto';

// The raw address exists only in this short-lived, in-process limiter. It is
// never written to the audit log. A shared edge limiter is required for replicas.
const policy = [
  [/^\/auth\/(login|registro|recover|password)/, 'auth', 8],
  [/^\/(pagos\/mercadopago\/webhook|emails\/resend\/recibos)$/, 'webhook', 60],
  [/^\/checkout\/(pedidos|cotizar-envio)/, 'checkout', 12],
  [/^\/seguimiento\/(intercambiar|renovar)/,'order_links',6],
  [/^\/seguimiento\//,'order_read',30],
  [/^\/mayorista\/solicitudes$/, 'wholesale_submit', 6],
  [/^\/mayorista\/cotizar$/, 'wholesale_quote', 60],
  [/^\/(equipo|inventario|ventas|admin)/, 'admin', 60],
];

export function securityEvent(type, req, fields = {}) {
  const route = req.path.startsWith('/api/seguimiento/')?'/api/seguimiento/:action':req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:id');
  const event = { kind: 'security', type, request_id: req.id, route,
    ...(Number.isInteger(fields.status) ? { status: fields.status } : {}) };
  console.warn(JSON.stringify(event));
}

export function securityMiddleware({ origin, production, rateStore, url }) {
  const buckets = new Map();
  return async (req, res, next) => {
    req.id = randomUUID();
    res.set({
      'X-Request-ID': req.id,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': publicCspFor({production,url}),
    });
    if (production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (!req.path.startsWith('/api/')) return next();
    res.set('Cache-Control', 'private, no-store');
    const route = req.path.slice(4);
    const [, category, limit] = policy.find(([pattern,category]) => pattern.test(route) && (category!=='wholesale_submit'||req.method==='POST')) ?? [null, 'api', 180];
    if(rateStore){
      try{const quota=await rateStore.take({identity:req.ip||req.socket.remoteAddress,category,limit});
       if(!quota.allowed){res.set('Retry-After',String(quota.retry_after));securityEvent('RATE_LIMIT',req,{status:429});return res.status(429).json({error:'Demasiadas solicitudes. Intentá en un minuto.'});}
      }catch{securityEvent('RATE_STORE_UNAVAILABLE',req,{status:503});return res.status(503).json({error:'Servicio temporalmente no disponible.'});}
    }
    const now = Date.now();
    for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
    const key = `${req.socket.remoteAddress}:${category}`;
    const bucket = buckets.get(key) ?? { until: now + 60_000, count: 0 };
    bucket.count++; buckets.set(key, bucket);
    // Prevent unbounded memory use from forged source addresses at the edge.
    if (buckets.size > 10_000) buckets.delete(buckets.keys().next().value);
    if (bucket.count > limit) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((bucket.until - now) / 1000))));
      securityEvent('RATE_LIMIT', req, { status: 429 });
      return res.status(429).json({ error: 'Demasiadas solicitudes. Intentá en un minuto.' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !['/pagos/mercadopago/webhook','/emails/resend/recibos'].includes(route)) {
      if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') {
        securityEvent('ORIGIN_DENIED', req, { status: 403 });
        return res.status(403).json({ error: 'Origen no permitido' });
      }
      if (!req.is('application/json')) return res.status(415).json({ error: 'Se requiere JSON' });
    }
    next();
  };
}
