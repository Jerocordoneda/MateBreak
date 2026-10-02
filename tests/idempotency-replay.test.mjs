import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../tools/staging-idempotency-replay.js',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111',key='22222222-2222-4222-8222-222222222222';
const body=JSON.stringify({idempotencia:key,cotizacion_id:'33333333-3333-4333-8333-333333333333',pago:'mercadopago',envio:'correo_domicilio',directa:false,destinatario:{email:'private@example.invalid'}});
function fixture(origin='http://127.0.0.1:8888',failReplay=false){
 const calls=[];let cookies='opaque-browser-session';
 const window={location:{origin},fetch:async(input,options)=>{calls.push({input,body:options.body,credentials:options.credentials,cookies});
  if(failReplay&&calls.length===2)throw Error('local transport failure');
  return new Response(JSON.stringify(calls.length===1?{mock:true,paymentStatus:'approved',order:{id,estado:'pagado',total:18500,moneda:'ARS'}}:{order:{id,estado:'pagado',total:18500,moneda:'ARS'}}));
 }};
 vm.runInNewContext(source,{window,URL,Headers,Error,Promise,JSON,Number,Object});
 return {window,calls};
}
test('capture holds navigation; replay preserves exact body, key and browser session without exposing payload',async()=>{
 const {window,calls}=fixture();const responsePromise=window.fetch('/api/checkout/pedidos',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body});
 while(!window.mbStagingReplay.inspect().ready)await new Promise(r=>setImmediate(r));
 const state=window.mbStagingReplay.inspect();assert.equal(state.idempotencyKey,key);assert.doesNotMatch(JSON.stringify(state),/private|opaque|destinatario/);
 await assert.rejects(window.mbStagingReplay.replayOnce());window.mbStagingReplay.confirmAudit(id);
 const result=await window.mbStagingReplay.replayOnce();assert.equal(result.orderId,id);assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1].body,body);
 await assert.rejects(window.mbStagingReplay.replayOnce());window.mbStagingReplay.release();assert.equal((await responsePromise).status,200);assert.equal(window.mbStagingReplay,undefined);
});
test('failed replay consumes its one attempt; no automated retry',async()=>{
 const {window,calls}=fixture(undefined,true);const first=window.fetch('/api/checkout/pedidos',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body});
 while(!window.mbStagingReplay.inspect().ready)await new Promise(r=>setImmediate(r));
 window.mbStagingReplay.confirmAudit(id);await assert.rejects(window.mbStagingReplay.replayOnce());await assert.rejects(window.mbStagingReplay.replayOnce());assert.equal(calls.length,2);window.mbStagingReplay.release();await first;
});
test('production/foreign origin and credential-bearing headers are refused before sending',async()=>{
 assert.throws(()=>fixture('https://matebreak.com.ar'));const {window,calls}=fixture();
 await assert.rejects(window.fetch('/api/checkout/pedidos',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:'synthetic-forbidden'},body}));assert.equal(calls.length,0);window.mbStagingReplay.release();
});
test('malformed private payload is refused without echoing its contents',async()=>{
 const {window,calls}=fixture();await assert.rejects(window.fetch('/api/checkout/pedidos',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'private-address-and-secret'}),error=>!error.message.includes('private-address-and-secret'));
 assert.equal(calls.length,0);window.mbStagingReplay.release();
});
