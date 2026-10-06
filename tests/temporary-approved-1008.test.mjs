import test from 'node:test';import assert from 'node:assert/strict';
import {runApproved1008Once} from '../server/jobs/temporary-approved-1008.mjs';
import {createMercadoPago} from '../server/payments/mercadopago.mjs';
const config={staging:true,production:false,stagingMpTestEnabled:true,stagingPersistMock:false,shippingMode:'mock',paymentsMode:'real',
 stagingProjectRef:'rxccjczyywhewqqdfgxm',origin:'https://matebreak-staging.vercel.app',
 mercadoPago:{environment:'test',expectedLiveMode:true,collectorId:'3741487042',accessToken:'APP_USR-synthetic',webhookSecret:'synthetic'}};
test('approved recovery refuses any expanded context before claiming a job',async()=>{
 for(const patch of [{production:true},{staging:false},{stagingProjectRef:'abcdefghijklmnopqrst'},
  {mercadoPago:{...config.mercadoPago,expectedLiveMode:false}},{origin:'https://production.example.test'}]){
  let calls=0;await assert.rejects(runApproved1008Once({config:{...config,...patch},admin:{rpc:()=>{calls++;}},log:()=>{}}));assert.equal(calls,0);
 }
});
test('approved recovery consumes existing job and verifies duplicate; never queues, purchases or schedules',async()=>{
 const calls=[],logs=[];const pid='182650336328';
 const provider=createMercadoPago({...config.mercadoPago,enabled:true,origin:config.origin,requireTestIdentity:true,appEnvironment:'staging',production:false},async url=>url.endsWith('/users/me')?
  {ok:true,status:200,url,redirected:false,headers:new Headers({'content-type':'application/json'}),json:async()=>({id:3741487042,tags:['test_user']})}:
  {ok:true,json:async()=>({id:Number(pid),external_reference:'1afd463b-2465-4a57-b702-62777682c8af',collector_id:3741487042,live_mode:true,currency_id:'ARS',transaction_amount:10000,status:'approved',date_last_updated:'2026-10-06T11:27:26Z'})});
 let observations=0;
 const admin={rpc:async(name,args)=>{calls.push(name);return {data:name==='mb_claim_payment_reconciliation'?{paymentId:pid,claimId:'synthetic-claim'}:name==='mb_reconcile_mp_payment'?{review:true,outcome:++observations===1?'revision_manual':'duplicate'}:null};}};
 await runApproved1008Once({config,admin,provider,log:e=>logs.push(e)});
 assert.deepEqual(calls,['mb_claim_payment_reconciliation','mb_reconcile_mp_payment','mb_finish_payment_reconciliation','mb_reconcile_mp_payment']);
 assert.equal(logs[0].duplicate,true);assert.equal(logs[0].reconciliation_executed,true);assert.equal(JSON.stringify(logs).includes('synthetic-claim'),false);
});
