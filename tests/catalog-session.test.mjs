import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
const uid='11111111-1111-4111-8111-111111111111',sid='aaaaaaaa-1111-4111-8111-111111111111';
const access='fixture.'+Buffer.from(JSON.stringify({session_id:sid})).toString('base64url')+'.fixture';
const inventory=[{variante_id:2,comprable:true,con_stock:true},{variante_id:3,comprable:true,con_stock:false}];
const row={id_producto:13,nombre:'Fixture',descripcion:'Local only',slug:'fixture',moneda:'ARS',
 catalogo_producto:{publicado:true,precio:10000},catalogo_producto_categoria:[],catalogo_opcion:[],
 catalogo_variante:[{id:2,vigente:true},{id:3,vigente:true}],catalogo_imagen:[],catalogo_promocion:[],combo:null};
async function fixture(t,{live=true,pause=false,images=[]}={}){
 const calls=[];let release,entered,guestEntered;
 const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});
 const guestStarted=new Promise(r=>{guestEntered=r;});
 const admin={from(){return {select(){return this;},eq(){return this;},order(){return this;},range:async()=>({data:[{...structuredClone(row),catalogo_imagen:images}]})};},
  async rpc(name,args){calls.push({name,args});
   if(name==='mb_wholesale_access')return {data:live};
   if(name==='mb_catalogo_disponibilidad'){entered();if(pause)await gate;return {data:inventory};}
   // The actual SQL dispatcher SELECT to_jsonb(SETOF...) INTO returns one object.
   if(name==='mb_sensitive_session_rpc'){entered();return {data:inventory[0]};}
   throw Error('Unexpected fixture RPC');
  }};
 const {app}=createApp({url:'https://fixture.supabase.co',secret:'fixture',publishable:'fixture',origin:'https://matebreak.test',
  production:false,shippingMode:'mock',paymentsMode:'mock'},{admin,rateStore:{take:async()=>({allowed:true})},
  authFactory:req=>({auth:{getUser:async()=>{if(!req.headers['x-fixture-user'])guestEntered();return {data:{user:req.headers['x-fixture-user']?{id:uid}:null}};},
  getSession:async()=>({data:{session:{access_token:access}}})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 return {calls,started,guestStarted,release,get:(authenticated=false)=>fetch(`http://127.0.0.1:${server.address().port}/api/productos`,{headers:authenticated?{'x-fixture-user':'1'}:{}})};
}
test('authenticated public catalog preserves every availability row; concurrent guest shares only a valid array',async t=>{
 const f=await fixture(t,{pause:true});const authenticated=f.get(true);await f.started;
 const guest=f.get();await f.guestStarted;await new Promise(setImmediate);f.release();
 for(const r of await Promise.all([authenticated,guest])){
  assert.equal(r.status,200);const products=await r.json();assert.equal(products.length,1);
  assert.deepEqual(products[0].variantes.map(v=>[v.id,v.comprable,v.con_stock]),[['2',true,true],['3',true,false]]);
 }
 assert.equal(f.calls.filter(c=>c.name==='mb_catalogo_disponibilidad').length,1);
 assert.equal(f.calls.filter(c=>c.name==='mb_sensitive_session_rpc').length,0);
 assert.equal(f.calls.filter(c=>c.name==='mb_wholesale_access').length,1);
 assert.equal((await f.get()).status,200);
});
test('public catalog still rejects a revoked authenticated session before querying availability',async t=>{
 const f=await fixture(t,{live:false});assert.equal((await f.get(true)).status,401);
 assert.deepEqual(f.calls.map(c=>c.name),['mb_wholesale_access']);
 assert.equal((await f.get()).status,200);
});
test('an image with a missing asset cannot turn a valid catalogue into HTTP 500',async t=>{
 const f=await fixture(t,{images:[{vigente:true,posicion:0,catalogo_asset:null,source_url:'https://fixture.test/photo'}]});
 const r=await f.get();assert.equal(r.status,200);const products=await r.json();assert.equal(products[0].variantes.length,2);assert.deepEqual(products[0].imagenes,[]);
});
