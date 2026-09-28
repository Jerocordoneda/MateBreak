import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, hashToken } from '../server/app.mjs';

async function fixture(t, user = null) {
 const calls = [];
 const { app } = createApp({ url: 'https://example.supabase.co', secret: 'test', publishable: 'test', origin: 'https://matebreak.test', production: true }, {
  admin: { rpc: async (name, args) => { calls.push({ name, args }); return { data: { items: [], total: 0 }, error: null }; } },
  authFactory: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
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
test('checkout requires verified login; body cannot impersonate a customer', async t => {
 const { request, calls } = await fixture(t); const res = await request('/api/pedidos', { method: 'POST', headers: { origin: 'https://matebreak.test', 'content-type': 'application/json' }, body: JSON.stringify({ usuario_id: 'forged' }) }); assert.equal(res.status, 401); assert.equal(calls.length, 0);
});
test('cart ignores browser prices and owner; accepts only quantity and product id', async t => {
 const { request, calls } = await fixture(t, { id: 'real-user' }); const res = await request('/api/carrito/items/9', { method: 'PUT', headers: { origin: 'https://matebreak.test', 'content-type': 'application/json' }, body: JSON.stringify({ cantidad: 2, precio: 0, usuario_id: 'forged' }) }); assert.equal(res.status, 200); assert.deepEqual(calls[0].args.p_datos, { producto_id: '9', cantidad: 2 }); assert.equal(calls[0].args.p_usuario_id, 'real-user');
});
test('invalid quantities are rejected and secrets are not served as static files', async t => {
 const { request, calls } = await fixture(t); const res = await request('/api/carrito/items/9', { method: 'PUT', headers: { origin: 'https://matebreak.test', 'content-type': 'application/json' }, body: '{"cantidad":-1}' }); assert.equal(res.status, 400); assert.equal(calls.length, 0);
 for (const url of ['/.env', '/server/app.mjs', '/package.json', '/supabase/migrations/20260907203438_commerce.sql']) assert.equal((await request(url)).status, 404);
});
