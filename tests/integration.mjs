// Local-only test; credentials are discovered from this worktree's CLI runtime.
// Creates and removes two dedicated test accounts, without sending emails.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus } from '../scripts/local-test-runtime.mjs';
const status = localStatus();
const url = status.API_URL;
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ids = [];
const origin = process.env.APP_ORIGIN || 'http://localhost:3000';
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname), 'BFF must be local');
function client() {
 const jar = new Map();
 return async (route, method = 'GET', body) => {
  const res = await fetch(origin + '/api' + route, { method, headers: { Origin: origin, Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; '), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  for (const item of res.headers.getSetCookie()) { const pair = item.split(';')[0]; const at = pair.indexOf('='); jar.set(pair.slice(0,at), pair.slice(at+1)); }
  return { status: res.status, data: await res.json() };
 };
}
try {
 const customers = [];
 for (let n=0;n<2;n++) {
  const email = `mb-test-${randomBytes(10).toString('hex')}@example.invalid`, password = randomBytes(24).toString('base64url');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw Error(error.message); ids.push(data.user.id); customers.push({ email, password, request: client() });
 }
 const a=customers[0].request, b=customers[1].request;
 const guest = await a('/carrito'); assert.equal(guest.status,200);
 for (const c of customers) assert.equal((await c.request('/auth/login','POST',{email:c.email,password:c.password})).status,200);
 assert.equal((await a('/admin/inventario')).status,403,'real customer cannot read inventory');
 assert.equal((await a('/admin/inventario/historial')).status,403);
 assert.equal((await a('/carrito')).data.id,guest.data.id, 'guest cart must survive login');
 assert.equal((await a('/perfil','PUT',{nombre:'TEST',telefono:'000'})).status,200);
 assert.equal((await a('/perfil')).data.nombre,'TEST');
 assert.equal((await a('/sesion')).data.usuario.rol,'cliente');
 const email=await a('/emails','POST',{email:'mb-contact-test@example.invalid',usuario_id:ids[1]});assert.equal(email.status,201);
 assert.equal((await a('/emails')).data[0].email,'mb-contact-test@example.invalid');assert.equal((await b('/emails')).data.length,0);
 await b('/emails/'+email.data.id,'DELETE',{});assert.equal((await a('/emails')).data.length,1);
 const addr = await a('/direcciones','POST',{destinatario:'TEST',telefono:'000',calle:'TEST 1',ciudad:'TEST',departamento:'TEST',pais:'UY'});
 assert.equal(addr.status,201); assert.equal((await b('/direcciones')).data.length,0);
 assert.equal((await b('/direcciones/'+addr.data.id,'PUT',{calle:'forged'})).status,400);
 assert.equal((await a('/direcciones')).data[0].calle,'TEST 1');
 assert.deepEqual((await a('/pedidos')).data,[]);
 assert.equal((await a('/auth/logout','POST',{})).status,200);
 assert.equal((await a('/sesion')).data.usuario,null);
 assert.equal((await a('/pedidos')).status,401);
 console.log('PASS: real Auth login/logout, guest-cart attachment, profile, address ownership, private orders');
} finally {
 for (const id of ids) {
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw Error(`Test-account cleanup failed: ${id} (${error.code})`);
 }
 console.log('Temporary test accounts removed (no emails sent).');
}
