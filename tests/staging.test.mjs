import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../server/config/environment.mjs';
import {assertStagingConfig,PROTECTED_PRODUCTION_REF} from '../server/config/staging.mjs';
import {createApp} from '../server/app.mjs';
const ref='abcdefghijklmnopqrst';
const env={APP_ENV:'staging',NODE_ENV:'development',SUPABASE_STAGING_PROJECT_REF:ref,SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_PUBLISHABLE_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic',APP_ORIGIN:'https://stage.example.test',SHIPPING_MODE:'mock',PAYMENTS_MODE:'mock',MATEBREAK_STAGING_PERSIST_MOCK:'1'};
test('staging validates before connections and requires exact isolated project, HTTPS and mocks',()=>{
 const {config}=loadConfig(env);assert.equal(config.stagingPersistMock,true);assertStagingConfig(config);
 for(const patch of [{SUPABASE_STAGING_PROJECT_REF:PROTECTED_PRODUCTION_REF,SUPABASE_URL:`https://${PROTECTED_PRODUCTION_REF}.supabase.co`},
 {SUPABASE_URL:'https://other.supabase.co'},{APP_ORIGIN:'http://stage.example.test'},{NODE_ENV:'production'},{SHIPPING_MODE:'real'},{PAYMENTS_MODE:'real'},
 {MP_ACCESS_TOKEN:'must-not-use'},{CORREO_MICORREO_PASSWORD:'must-not-use'},{MATEBREAK_LOCAL_PERSIST_MOCK:'1'},{APP_ENV:'local'},{MATEBREAK_STAGING_PERSIST_MOCK:'0'}])assert.throws(()=>loadConfig({...env,...patch}));
 assert.throws(()=>createApp({...config,staging:false}));
});
test('staging keeps secure host cookies, HSTS and same-origin rejection',async t=>{
 const {config}=loadConfig(env);const {app}=createApp(config,{admin:{rpc:async()=>({data:{items:[]},error:null})},authFactory:()=>({auth:{getUser:async()=>({data:{user:null},error:null})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const cart=await fetch(base+'/api/carrito');assert.match(cart.headers.get('set-cookie'),/__Host-mb_cart=.*HttpOnly.*Secure.*SameSite=Lax/i);assert.ok(cart.headers.get('strict-transport-security'));
 const denied=await fetch(base+'/api/carrito/items/1',{method:'PUT',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{"cantidad":1}'});assert.equal(denied.status,403);
 const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{status:'ok'});
});
test('persisted staging checkout requires Auth and uses the SQL lifecycle rather than the ephemeral mock store',async t=>{
 const {config}=loadConfig(env);const calls=[];let signedIn=true;const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid'};
 const selection={id:'22222222-2222-4222-8222-222222222222',items:[{producto_id:1,cantidad:1}]};
 const admin={rpc:async(name,args)=>{calls.push(name);return {data:name==='mb_comercio'?selection:name==='mb_checkout_minorista'?{id:'33333333-3333-4333-8333-333333333333',estado:'pendiente_pago',total:10000,moneda:'ARS',reserva_hasta:new Date(Date.now()+60000).toISOString()}:{items:[],subtotal:10000,moneda:'ARS'},error:null};},from:table=>{
  if(table==='pago')return {select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{id:'44444444-4444-4444-8444-444444444444',importe:10000,moneda:'ARS'},error:null})})})})};
  if(table==='pedido')return {select:()=>({eq:()=>({eq:()=>({single:async()=>({data:{id:'33333333-3333-4333-8333-333333333333',estado:'pagado'},error:null})})})})};
  throw Error('Unexpected staging DB path');
 }};
 const {app}=createApp(config,{admin,authFactory:()=>({auth:{getUser:async()=>({data:{user:signedIn?user:null},error:null})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/checkout/pedidos`,{method:'POST',headers:{origin:config.origin,'content-type':'application/json'},body:JSON.stringify({idempotencia:'55555555-5555-4555-8555-555555555555',pago:'mercadopago',envio:'retiro',destinatario:{nombre:'Fixture',apellido:'Sintético',email:'fixture@example.invalid',telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Fixture',calle:'Fixture',numero:'1'}})});
 assert.equal(response.status,201,await response.clone().text());assert.equal((await response.json()).order.estado,'pagado');assert.deepEqual(calls,['mb_checkout_minorista','mb_confirmar_pago']);
 signedIn=false;const denied=await fetch(`http://127.0.0.1:${server.address().port}/api/checkout/pedidos`,{method:'POST',headers:{origin:config.origin,'content-type':'application/json'},body:'{}'});assert.equal(denied.status,401);assert.deepEqual(calls,['mb_checkout_minorista','mb_confirmar_pago']);
});
