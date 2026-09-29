import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, hashToken } from '../server/app.mjs';

async function fixture(t, user = null, extraOverrides = {}) {
 const calls = [];
 const { app } = createApp({ url: 'https://example.supabase.co', secret: 'test', publishable: 'test', origin: 'https://matebreak.test', production: true }, {
  admin: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { items: [], total: 0 }, error: null }; } },
  authFactory: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
  ...extraOverrides,
 });
 const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
 t.after(() => new Promise(resolve => server.close(resolve)));
 return { calls, request: (url, options) => fetch(`http://127.0.0.1:${server.address().port}${url}`, options) };
}
test('guest cookie is HttpOnly, secure, same-site; only its hash reaches DB', async t => {
 const { request, calls } = await fixture(t); const res = await request('/api/carrito'); assert.equal(res.status, 200);
 const cookie = res.headers.get('set-cookie'); assert.match(cookie, /__Host-mb_cart=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/i);
 const token = cookie.match(/mb_cart=([a-f0-9]+)/)[1]; assert.equal(calls[0].args.p_token_hash, hashToken(token)); assert.equal(calls[0].args.p_usuario_id, null); assert.equal(res.headers.get('cache-control'), 'private, no-store');
});
test('cross-site writes are rejected before reaching DB', async t => {
 const { request, calls } = await fixture(t); const res = await request('/api/carrito/items/1', { method: 'PUT', headers: { origin: 'https://attacker.test', 'content-type': 'application/json' }, body: '{"cantidad":1}' }); assert.equal(res.status, 403); assert.equal(calls.length, 0);
});
test('parallel session reads cannot overwrite the cart cookie', async t => {
 const { request } = await fixture(t); const res = await request('/api/sesion');
 assert.equal(res.status,200); assert.equal(res.headers.get('set-cookie'),null);
});
test('legacy order endpoint cannot bypass the new checkout', async t => {
 const { request, calls } = await fixture(t); const res = await request('/api/pedidos', { method: 'POST', headers: { origin: 'https://matebreak.test', 'content-type': 'application/json' }, body: JSON.stringify({ usuario_id: 'forged' }) }); assert.equal(res.status, 410); assert.equal(calls.length, 0);
});
test('cart ignores browser prices and owner; accepts only quantity and product id', async t => {
 const { request, calls } = await fixture(t, { id: 'real-user' }); const res = await request('/api/carrito/items/9', { method: 'PUT', headers: { origin: 'https://matebreak.test', 'content-type': 'application/json' }, body: JSON.stringify({ cantidad: 2, precio: 0, usuario_id: 'forged' }) }); assert.equal(res.status, 200); assert.deepEqual(calls[0].args.p_datos, { producto_id: '9', cantidad: 2 }); assert.equal(calls[0].args.p_usuario_id, 'real-user');
});
test('invalid quantities are rejected and secrets are not served as static files', async t => {
 const { request, calls } = await fixture(t); const res = await request('/api/carrito/items/9', { method: 'PUT', headers: { origin: 'https://matebreak.test', 'content-type': 'application/json' }, body: '{"cantidad":-1}' }); assert.equal(res.status, 400); assert.equal(calls.length, 0);
 for (const url of ['/.env', '/server/app.mjs', '/package.json', '/supabase/migrations/20260907203438_commerce.sql']) assert.equal((await request(url)).status, 404);
});

test('security headers protect public and private responses without exposing server details', async t => {
 const { request } = await fixture(t);
 for (const url of ['/', '/api/sesion']) {
  const response = await request(url);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(response.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.match(response.headers.get('strict-transport-security'), /max-age=31536000/);
 }
});

test('auth limiter uses socket address, rejects spoofed proxy headers and supplies retry delay', async t => {
 const { request } = await fixture(t);
 const original = console.warn;
 console.warn = () => {};
 try {
  for (let i = 0; i < 8; i++) {
   const response = await request('/api/auth/login', { method:'POST', headers:{origin:'https://wrong.test',
    'content-type':'application/json', 'x-forwarded-for':`203.0.113.${i}`}, body:'{}' });
   assert.equal(response.status, 403);
  }
  const blocked = await request('/api/auth/login', { method:'POST', headers:{origin:'https://wrong.test',
   'content-type':'application/json', 'x-forwarded-for':'198.51.100.1'}, body:'{}' });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
 } finally { console.warn = original; }
});

test('production rejects malformed origins and HTTP before creating clients', () => {
 for (const origin of ['https:matebreak.test', 'https://matebreak.test/path', 'https://user:pass@matebreak.test', 'http://matebreak.test']) {
  assert.throws(() => createApp({ url:'https://example.supabase.co', secret:'test', publishable:'test', origin, production:true },
   { admin:{}, authFactory:()=>({}) }));
 }
});

test('malformed content type, oversized JSON and SQL-like IDs fail before commerce RPC', async t => {
 const { request, calls } = await fixture(t);
 const base = { method:'PUT', headers:{origin:'https://matebreak.test', 'content-type':'text/plain'}, body:'{"cantidad":1}' };
 assert.equal((await request('/api/carrito/items/1', base)).status, 415);
 assert.equal((await request('/api/carrito/items/1%27%20OR%201=1', { ...base,
  headers:{...base.headers, 'content-type':'application/json'} })).status, 400);
 const tooBig = await request('/api/carrito/items/1', { ...base,
  headers:{...base.headers, 'content-type':'application/json'},
  body:JSON.stringify({cantidad:1, padding:'x'.repeat(17_000)}) });
 assert.equal(tooBig.status, 413);
 assert.equal(calls.length, 0);
});

test('empty and unexpected JSON bodies fail cleanly without invoking Auth or commerce', async t => {
 const { request, calls } = await fixture(t);
 const headers = { origin:'https://matebreak.test', 'content-type':'application/json' };
 for (const [url, method] of [['/api/auth/login','POST'], ['/api/carrito/items/1','PUT']]) {
  for (const body of ['null', '[]', '{}']) {
   const response = await request(url, { method, headers, body });
   assert.equal(response.status, 400);
  }
 }
 assert.equal(calls.length, 0);
});

test('unsigned payment notification is rejected before provider lookup or database access', async t => {
 let providerCalls = 0;
 const { request, calls } = await fixture(t, null, { mercadoPago: {
  ready:true, verifyWebhook:()=>false, getPayment:async()=>{ providerCalls++; return {}; },
 } });
 const original = console.warn; console.warn = () => {};
 try {
  const response = await request('/api/pagos/mercadopago/webhook?type=payment&data.id=123',
   { method:'POST', headers:{'content-type':'application/json'}, body:'{}' });
  assert.equal(response.status, 401);
  assert.equal(providerCalls, 0);
  assert.equal(calls.length, 0);
 } finally { console.warn = original; }
});
