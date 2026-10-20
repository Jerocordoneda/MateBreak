import test from 'node:test';
import assert from 'node:assert/strict';
import {createMercadoPago} from '../server/payments/mercadopago.mjs';
import {paymentObservation} from '../server/payments/reconciliation.mjs';
import {loadConfig} from '../server/config/environment.mjs';
const seller=3741487042,endpoint='https://api.mercadolibre.com/users/me';
const order={id:'11111111-1111-4111-8111-111111111111',total:100,email:'fixture@example.invalid',items:[{producto_id:1}],expiresAt:new Date(Date.now()+60000).toISOString()};
const options={enabled:true,accessToken:'APP_USR-synthetic-only',webhookSecret:'synthetic',origin:'https://stage.example.test',collectorId:String(seller),expectedLiveMode:false,environment:'test',requireTestIdentity:true};
const jsonResponse=value=>({ok:true,status:200,url:endpoint,redirected:false,headers:new Headers({'content-type':'application/json'}),json:async()=>value});
const preference={id:'synthetic',collector_id:seller,init_point:'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic'};
function setup(identity=jsonResponse({id:seller,tags:['normal','test_user']}),pref=preference){
 const calls=[];const provider=createMercadoPago(options,async(url,input)=>{calls.push({url,input});if(url===endpoint)return typeof identity==='function'?identity():identity;return {ok:true,json:async()=>pref};});
 return {provider,calls};
}
test('APP_USR TEST identity is authenticated before every POST, with no invented Preference live_mode',async()=>{
 const {provider,calls}=setup();
 assert.deepEqual(await provider.verifyTestIdentity(),{sellerId:String(seller),testUser:true});
 await provider.createPreference(order);await provider.createPreference(order);
 assert.deepEqual(calls.map(c=>c.input.method),['GET','GET','POST','GET','POST']);
 for(const call of calls.filter(c=>c.url===endpoint)){assert.equal(call.input.redirect,'error');assert.ok(call.input.signal instanceof AbortSignal);assert.equal(call.input.headers.Authorization,'Bearer APP_USR-synthetic-only');}
 assert.equal('live_mode' in preference,false);
});
test('invalid/non-TEST/unknown identity never sends a preference POST or exposes private response',async()=>{
 const fixtures=[{id:seller+1,tags:['test_user']},{id:String(seller),tags:['test_user']},{id:seller,tags:['normal']},{id:seller},{id:seller,tags:'test_user'},{id:seller,tags:['test_user',null]},null];
 for(const value of fixtures){
  const {provider,calls}=setup(jsonResponse(value));
  await assert.rejects(provider.createPreference(order),/^Error: Mercado Pago TEST identity verification failed$/);
  assert.equal(calls.length,1);assert.equal(calls[0].input.method,'GET');
 }
});
test('identity timeout, HTTP errors, redirects, bad MIME/URL/JSON fail closed without leaking error',async()=>{
 const good=jsonResponse({id:seller,tags:['test_user']});
 for(const identity of [()=>{throw Error('private-token@example.invalid');},()=>{throw new DOMException('private','TimeoutError');},
  {...good,ok:false,status:401},{...good,status:302},{...good,redirected:true},{...good,url:'https://evil.example.invalid/users/me'},
  {...good,headers:new Headers({'content-type':'text/html'})},{...good,json:async()=>{throw Error('private body');}}]){
  const {provider,calls}=setup(identity);await assert.rejects(provider.createPreference(order),/^Error: Mercado Pago TEST identity verification failed$/);assert.equal(calls.length,1);
 }
});
test('Preference collector mismatch/missing/type confusion prevent checkout redirect',async()=>{
 for(const collector_id of [seller+1,undefined,String(seller),null]){
  const {provider,calls}=setup(undefined,{...preference,collector_id});
  await assert.rejects(provider.createPreference(order),/preference seller mismatch/);assert.equal(calls[0].url,endpoint);
 }
});
test('a successful identity check cannot be cached across a later contradiction',async()=>{
 let check=0,posts=0;const provider=createMercadoPago(options,async(url)=>{
  if(url===endpoint)return jsonResponse({id:seller,tags:++check===1?['test_user']:['normal']});
  posts++;return {ok:true,json:async()=>preference};
 });
 await provider.verifyTestIdentity();await assert.rejects(provider.createPreference(order),/verification failed/);assert.equal(posts,0);
});
test('legacy TEST- can use the same verified seller contract, never prefixed identity',async()=>{
 const p=createMercadoPago({...options,accessToken:'TEST-synthetic-only'},async(url)=>url===endpoint?jsonResponse({id:seller,tags:['test_user']}):{ok:true,json:async()=>preference});
 await p.createPreference(order);
 assert.throws(()=>createMercadoPago({...options,collectorId:'456'}),/contract invalid/);
 assert.throws(()=>createMercadoPago({...options,expectedLiveMode:true}),/contract invalid/);
});
test('payment authoritative signal remains required; missing, string or contradictory live mode cannot confirm',()=>{
 const p={id:123,external_reference:order.id,collector_id:seller,live_mode:false,currency_id:'ARS',transaction_amount:100,transaction_amount_refunded:0,status:'approved',date_last_updated:new Date().toISOString()};
 const config={paymentId:'123',collectorId:String(seller),expectedLiveMode:false,environment:'test'};
 assert.equal(paymentObservation(p,config).amount,100);
 for(const patch of [{live_mode:true},{live_mode:undefined},{live_mode:'false'},{collector_id:seller+1},{id:124}])assert.throws(()=>paymentObservation({...p,...patch},config));
});
test('declared verified flags cannot substitute identity, and production/mock stays forbidden',()=>{
 const ref='abcdefghijklmnopqrst';const env={APP_ENV:'staging',NODE_ENV:'development',APP_ORIGIN:'https://stage.example.test',SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_STAGING_PROJECT_REF:ref,SUPABASE_PUBLISHABLE_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic',SHIPPING_MODE:'mock',PAYMENTS_MODE:'real',MATEBREAK_STAGING_MP_TEST:'1',MATEBREAK_STAGING_PERSIST_MOCK:'0',MP_ENVIRONMENT:'test',MP_EXPECTED_LIVE_MODE:'false',MP_COLLECTOR_ID:String(seller),MP_ACCESS_TOKEN:'APP_USR-synthetic-only',MERCADOPAGO_WEBHOOK_SECRET:'synthetic'};
 assert.doesNotThrow(()=>loadConfig(env));
 for(const patch of [{MP_TEST_VERIFIED:'true'},{MP_COLLECTOR_ID:'456'},{NODE_ENV:'production'},{MATEBREAK_STAGING_PERSIST_MOCK:'1'},{MATEBREAK_STAGING_PERSIST_MOCK:''},{MATEBREAK_STAGING_PERSIST_MOCK:'false'},
  {AUTH_RECOVERY_ENABLED:'1'},{PAYMENT_RECONCILIATION_ENABLED:'1'},{EMAIL_WORKER_ENABLED:'1'},{EMAIL_RECEIPTS_ENABLED:'1'},{EMAILS_ENABLED:'1'}])assert.throws(()=>loadConfig({...env,...patch}));
});
