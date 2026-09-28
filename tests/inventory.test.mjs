import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';

async function fixture(t, user = null, authorized = false, authError = null) {
 const calls = [];
 const { app } = createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'https://matebreak.test',production:true},{
  admin:{rpc:async (name,args) => { calls.push({name,args}); return name === 'mb_inventario_autorizado' ? {data:authorized,error:authError} : {data:[],error:null}; }},
  authFactory:() => ({auth:{getUser:async () => ({data:{user}})}}),
 });
 const server = app.listen(0,'127.0.0.1'); await new Promise(r => server.once('listening',r)); t.after(() => new Promise(r => server.close(r)));
 return {calls,request:(url,options) => fetch(`http://127.0.0.1:${server.address().port}${url}`,options)};
}
const write = body => ({method:'POST',headers:{origin:'https://matebreak.test','content-type':'application/json'},body:JSON.stringify(body)});
const adjustment = {tipo:'ingreso',cantidad:2,motivo:'Recepción del proveedor',idempotencia:'11e98619-7262-4920-86b6-ef59bd0eb0f1',disponible_esperado:1200,reservado_esperado:0};
test('anonymous inventory access is denied including HTML and private scripts',async t => {
 const {request,calls} = await fixture(t);
 for (const route of ['/api/admin/inventario','/api/admin/inventario/historial','/interno/inventario/app.js','/interno/inventario/style.css']) assert.equal((await request(route)).status,401);
 const page=await request('/interno/inventario',{redirect:'manual'});assert.equal(page.status,302);assert.equal(page.headers.get('location'),'/mi-cuenta');
 assert.equal((await request('/api/admin/inventario/1/ajustes',write(adjustment))).status,401); assert.equal(calls.length,0);
});
test('customer metadata cannot grant inventory privileges',async t => {
 const {request,calls} = await fixture(t,{id:'customer-id',user_metadata:{role:'admin',admin:true}},false);
 for (const route of ['/api/admin/inventario','/interno/inventario','/interno/inventario/app.js']) assert.equal((await request(route)).status,403);
 assert.equal((await request('/api/admin/inventario/1/ajustes',write({...adjustment,p_usuario_id:'admin-id'}))).status,403);
 assert.ok(calls.every(c => c.name === 'mb_inventario_autorizado' && c.args.p_usuario_id === 'customer-id'));
});
test('membership verification fails closed',async t => {
 const {request} = await fixture(t,{id:'team'},true,{code:'unavailable'});
 assert.equal((await request('/api/admin/inventario')).status,503);
});
test('team can access protected UI without caching or external scripts',async t => {
 const {request} = await fixture(t,{id:'team'},true);
 const html = await request('/interno/inventario'); assert.equal(html.status,200); assert.match(await html.text(),/Todo en su lugar/);
 assert.match(html.headers.get('cache-control'),/no-store/); assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const script = await request('/interno/inventario/app.js'); assert.equal(script.status,200); assert.match(script.headers.get('cache-control'),/no-store/);
 for (const route of ['/server/private-ui/inventory.html','/src/../server/private-ui/inventory.js']) assert.equal((await request(route)).status,404);
});
test('adjustments use only verified identity and allowlisted validated fields',async t => {
 const {request,calls} = await fixture(t,{id:'real-team'},true);
 assert.equal((await request('/api/admin/inventario/7/ajustes',write({...adjustment,usuario_id:'forged',stock:999999,precio:0}))).status,200);
 assert.deepEqual(calls[1],{name:'mb_inventario',args:{p_usuario_id:'real-team',p_accion:'ajustar',p_datos:{producto_id:'7',...adjustment}}});
 for (const change of [{cantidad:-1},{cantidad:1.2},{cantidad:0},{motivo:''},{idempotencia:'bad'},{reservado_esperado:-2},{tipo:'inicial'}]) assert.equal((await request('/api/admin/inventario/7/ajustes',write({...adjustment,...change}))).status,400);
 assert.equal(calls.filter(c => c.name === 'mb_inventario').length,1);
 assert.equal((await request('/api/admin/inventario/7/ajustes',write({...adjustment,tipo:'conteo',cantidad:0}))).status,200);
});
test('inventory rejects cross-site changes before authorization or data access',async t => {
 const {request,calls} = await fixture(t,{id:'team'},true), options = write(adjustment); options.headers.origin = 'https://other.test';
 assert.equal((await request('/api/admin/inventario/1/ajustes',options)).status,403); assert.equal(calls.length,0);
});
