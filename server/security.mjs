import { randomUUID } from 'node:crypto';

// The raw address exists only in this short-lived, in-process limiter. It is
// never written to the audit log. A shared edge limiter is required for replicas.
const policy = [
  [/^\/auth\/(login|registro|recover)/, 'auth', 8],
  [/^\/pagos\/mercadopago\/webhook$/, 'webhook', 60],
  [/^\/checkout\/(pedidos|cotizar-envio)/, 'checkout', 12],
  [/^\/(equipo|inventario|ventas|admin)/, 'admin', 60],
];

export function securityEvent(type, req, fields = {}) {
  const route = req.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:id');
  const event = { kind: 'security', type, request_id: req.id, route,
    ...(Number.isInteger(fields.status) ? { status: fields.status } : {}) };
  console.warn(JSON.stringify(event));
}

export function securityMiddleware({ origin, production }) {
  const buckets = new Map();
  return (req, res, next) => {
    req.id = randomUUID();
    res.set({
      'X-Request-ID': req.id,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'",
    });
    if (production) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (!req.path.startsWith('/api/')) return next();
    res.set('Cache-Control', 'private, no-store');
    const route = req.path.slice(4);
    const [, category, limit] = policy.find(([pattern]) => pattern.test(route)) ?? [null, 'api', 180];
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
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && route !== '/pagos/mercadopago/webhook') {
      if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') {
        securityEvent('ORIGIN_DENIED', req, { status: 403 });
        return res.status(403).json({ error: 'Origen no permitido' });
      }
      if (!req.is('application/json')) return res.status(415).json({ error: 'Se requiere JSON' });
    }
    next();
  };
}
