import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './helpers/business-app.mjs';
async function fixture(t,user=null,role='cliente'){
 const calls=[],{app}=createApp({url:'https://example.supabase.co',publishable:'test',secret:'test',origin:'https://matebreak.test',production:true},{authFactory:()=>({auth:{getUser:async()=>({data:{user}})}}),admin:{rpc:async(name,args)=>{calls.push({name,args});return {data:name==='mb_rol'?role:name==='mb_carrito_cantidad'?5:name==='mb_inventario_autorizado'?false:[],error:null};}}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));return {calls,request:(route,options)=>fetch(`http://127.0.0.1:${server.address().port}${route}`,options)};
}
const write=body=>({method:'POST',headers:{origin:'https://matebreak.test','content-type':'application/json'},body:JSON.stringify(body)});
test('home cart count does not create or replace a guest cookie',async t=>{const {request,calls}=await fixture(t);const r=await request('/api/carrito/resumen');assert.deepEqual(await r.json(),{cantidad:0});assert.equal(r.headers.get('set-cookie'),null);assert.equal(calls.length,0);});
test('cart count uses cookie hash and verified user, never query identity',async t=>{const {request,calls}=await fixture(t,{id:'real'});const r=await request('/api/carrito/resumen?usuario_id=forged',{headers:{cookie:'__Host-mb_cart='+'b'.repeat(64)}});assert.deepEqual(await r.json(),{cantidad:5});assert.equal(r.headers.get('set-cookie'),null);assert.equal(calls[0].args.p_usuario_id,'real');assert.notEqual(calls[0].args.p_token_hash,'b'.repeat(64));});
test('customer cannot grant seller role using editable metadata',async t=>{const {request,calls}=await fixture(t,{id:'customer',user_metadata:{role:'vendedor'}},'cliente');assert.equal((await request('/api/ventas')).status,403);assert.equal((await request('/api/ventas',write({usuario_id:'seller'}))).status,403);assert.equal(calls.filter(c=>c.name==='mb_ventas').length,0);const session=await request('/api/sesion');assert.equal((await session.json()).usuario.rol,'cliente');});
test('seller sees own sales but cannot read inventory or change roles',async t=>{const {request}=await fixture(t,{id:'seller'},'vendedor');assert.equal((await request('/api/ventas')).status,200);assert.equal((await request('/api/admin/inventario')).status,403);assert.equal((await request('/api/roles',write({rol:'administrador'}))).status,404);});
test('sales submission validates and ignores browser totals and identity',async t=>{
 const {request,calls}=await fixture(t,{id:'real-seller'},'vendedor');const body={idempotencia:'11e98619-7262-4920-86b6-ef59bd0eb0f1',cliente:'Cliente test',telefono:'',notas:'',estado:'por_grabar',metodo_pago:'efectivo',items:[{producto_id:'7',cantidad:2,precio_unitario:'125.50',personalizacion:'River'}]};
 assert.equal((await request('/api/ventas',write({...body,usuario_id:'forged',total:1}))).status,201);const rpc=calls.find(c=>c.name==='mb_ventas');assert.equal(rpc.args.p_usuario_id,'real-seller');assert.deepEqual(rpc.args.p_datos,body);
 for(const patch of [{estado:'pagado'},{items:[]},{items:[{...body.items[0],cantidad:-1}]},{items:[{...body.items[0],precio_unitario:'0'}]}])assert.equal((await request('/api/ventas',write({...body,...patch}))).status,400);
 assert.equal(calls.filter(c=>c.name==='mb_ventas').length,1);
});
