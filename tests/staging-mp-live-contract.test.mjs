import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createMercadoPago,isVerifiedStagingTestPayment} from '../server/payments/mercadopago.mjs';
import {paymentObservation,reconcilePayment} from '../server/payments/reconciliation.mjs';
import {loadConfig} from '../server/config/environment.mjs';
import {createProviders} from '../server/providers.mjs';
import {createApp} from './helpers/business-app.mjs';
const seller='3741487042',identityUrl='https://api.mercadolibre.com/users/me';
const orderId='1afd463b-2465-4a57-b702-62777682c8af';
const opts={enabled:true,accessToken:'APP_USR-synthetic',webhookSecret:'synthetic-secret',origin:'https://stage.example.test',
 collectorId:seller,expectedLiveMode:true,environment:'test',requireTestIdentity:true,appEnvironment:'staging',production:false};
const base={id:182650336328,external_reference:orderId,collector_id:Number(seller),live_mode:true,currency_id:'ARS',
 transaction_amount:10000,transaction_amount_refunded:0,status:'approved',date_last_updated:'2026-10-06T11:27:26Z'};
const observationConfig={paymentId:String(base.id),collectorId:seller,environment:'test',expectedLiveMode:true};
const env={APP_ENV:'staging',NODE_ENV:'development',APP_ORIGIN:opts.origin,SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
 SUPABASE_STAGING_PROJECT_REF:'abcdefghijklmnopqrst',SUPABASE_PUBLISHABLE_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic',
 SHIPPING_MODE:'mock',PAYMENTS_MODE:'real',MATEBREAK_STAGING_MP_TEST:'1',MATEBREAK_STAGING_PERSIST_MOCK:'0',
 MP_ENVIRONMENT:'test',MP_EXPECTED_LIVE_MODE:'true',MP_COLLECTOR_ID:seller,MP_ACCESS_TOKEN:opts.accessToken,MERCADOPAGO_WEBHOOK_SECRET:opts.webhookSecret};
function fixture({user={id:Number(seller),tags:['test_user']},patch={},config={}}={}){
 const calls=[];
 const provider=createMercadoPago({...opts,...config},async(url,input)=>{
  calls.push(url);
  if(url===identityUrl)return {ok:true,status:200,url,redirected:false,headers:new Headers({'content-type':'application/json'}),json:async()=>user};
  return {ok:true,json:async()=>({...base,...patch})};
 });return {provider,calls};
}
test('explicit Staging true is limited to fixed seller and no production/mock persistence',()=>{
 const {config}=loadConfig(env);const p=createProviders(config);assert.equal(p.webhook.expectedLiveMode,true);assert.equal(p.shipping.mock,true);
 for(const patch of [{MP_COLLECTOR_ID:'999'},{NODE_ENV:'production'},{APP_ENV:'production'},{APP_ENV:'local'},
  {MATEBREAK_STAGING_MP_TEST:'0'},{MATEBREAK_STAGING_PERSIST_MOCK:'1'},{MP_ENVIRONMENT:'production'},
  {EMAILS_ENABLED:'1'},{PAYMENT_RECONCILIATION_ENABLED:'1'},{MP_EXPECTED_LIVE_MODE:'TRUE'}])assert.throws(()=>loadConfig({...env,...patch}));
 for(const patch of [{collectorId:'999'},{requireTestIdentity:false},{appEnvironment:'production'},{appEnvironment:'local'},
  {production:true},{production:undefined},{environment:'production'}])assert.throws(()=>createMercadoPago({...opts,...patch}));
});
test('fresh authenticated fixed test_user proof permits actual true Payment without bypassing equality',async()=>{
 const {provider,calls}=fixture();const p=await provider.getPayment(String(base.id));
 assert.deepEqual(calls,[identityUrl,'https://api.mercadopago.com/v1/payments/'+base.id]);
 assert.equal(isVerifiedStagingTestPayment(p),true);assert.equal(paymentObservation(p,observationConfig).amount,10000);
 assert.equal(Object.isFrozen(p),true);assert.equal(isVerifiedStagingTestPayment({...p}),false);
 assert.throws(()=>paymentObservation({...p,verified:true,test_user:true},observationConfig),/provenance/);
});
test('non-test seller or other authenticated identity never obtains Payment or persists reconciliation',async()=>{
 for(const user of [{id:Number(seller),tags:[]},{id:999,tags:['test_user']},null]){
  const {provider,calls}=fixture({user});let writes=0;
  await assert.rejects(reconcilePayment({provider,paymentId:String(base.id),admin:{rpc:async()=>{writes++;}}}),/identity verification failed/);
  assert.equal(writes,0);assert.deepEqual(calls,[identityUrl]);
 }
});
test('authenticated TEST provenance never waives ID, collector, external reference, money, currency or live mode',async()=>{
 for(const patch of [{id:123},{collector_id:999},{external_reference:'bad'},{transaction_amount:1.001},{currency_id:'USD'},
  {live_mode:false},{live_mode:undefined},{live_mode:'true'},{status:'unknown'}]){
  const {provider}=fixture({patch});let writes=0;
  await assert.rejects(reconcilePayment({provider,paymentId:String(base.id),admin:{rpc:async()=>{writes++;}}}));assert.equal(writes,0);
 }
 assert.throws(()=>paymentObservation(base,{...observationConfig,collectorId:'999'}),/provenance/);
});
test('Staging live-mode exception still requires HMAC before queue and authoritative GET; review returns 200',async t=>{
 const {provider,calls}=fixture();const writes=[];const {config}=loadConfig(env);
 const {app}=createApp(config,{mercadoPago:provider,admin:{rpc:async(name,args)=>{writes.push({name,args});return {data:{outcome:'revision_manual',review:true}};}},authFactory:()=>({auth:{getUser:async()=>({data:{user:null}})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}/api/pagos/mercadopago/webhook?type=payment&data.id=${base.id}`;
 assert.equal((await fetch(url,{method:'POST'})).status,401);assert.equal(writes.length,0);assert.equal(calls.length,0);
 const ts=String(Math.floor(Date.now()/1000)),requestId='synthetic-request';
 const v1=createHmac('sha256',opts.webhookSecret).update(`id:${base.id};request-id:${requestId};ts:${ts};`).digest('hex');
 assert.equal((await fetch(url,{method:'POST',headers:{'x-signature':`ts=${ts},v1=${v1}`,'x-request-id':requestId}})).status,200);
 assert.deepEqual(writes.map(x=>x.name),['mb_queue_payment_reconciliation','mb_reconcile_mp_payment']);
 assert.equal(writes[1].args.p_observation.environment,'test');assert.equal(writes[1].args.p_observation.collectorId,seller);
});
