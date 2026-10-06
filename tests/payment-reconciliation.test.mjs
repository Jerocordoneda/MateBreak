import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createApp} from './helpers/business-app.mjs';
import {paymentObservation,reconcilePayment} from '../server/payments/reconciliation.mjs';
import {createMercadoPago,verifyMercadoPagoSignature} from '../server/payments/mercadopago.mjs';
const id='11111111-1111-4111-8111-111111111111';
const payment={id:123,external_reference:id,collector_id:456,live_mode:false,currency_id:'ARS',transaction_amount:100,transaction_amount_refunded:0,status:'approved',date_last_updated:'2026-10-04T07:00:00Z'};
const config={paymentId:'123',collectorId:'456',environment:'test',expectedLiveMode:false};
test('completion follows persisted observation, and failures leave a recoverable job',async()=>{
 const provider={ready:true,...config,getPayment:async()=>payment};
 const calls=[];
 const run=async(failAt)=>reconcilePayment({provider,paymentId:'123',admin:{rpc:async(name,args)=>{
  calls.push({name,args});return name===failAt?{error:{code:'XX000'}}:{data:{outcome:'aplicado'}};
 }}});
 await run();assert.deepEqual(calls.map(c=>c.name),['mb_reconcile_mp_payment','mb_complete_payment_reconciliation']);
 assert.deepEqual(calls[1].args,{p_payment_id:'123'});
 calls.length=0;await assert.rejects(run('mb_reconcile_mp_payment'));assert.equal(calls.length,1);
 calls.length=0;await assert.rejects(run('mb_complete_payment_reconciliation'),/completion failed/);assert.equal(calls.length,2);
});
test('payment observations minimize PII and reject account, environment and amount confusion',()=>{
 const o=paymentObservation({...payment,payer:{email:'private@example.test'},card:{number:'secret'}},config);
 assert.equal(o.amount,100);assert.match(o.digest,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(o).includes('private'));
 for(const patch of [{collector_id:999},{live_mode:true},{currency_id:'USD'},{transaction_amount:NaN},{transaction_amount:1.001},{transaction_amount_refunded:101},{date_last_updated:null},{id:999},{status:'mystery'}])assert.throws(()=>paymentObservation({...payment,...patch},config));
});
test('refund/chargeback/partial refund are preserved for atomic reconciliation',async()=>{
 for(const status of ['pending','rejected','cancelled','refunded','charged_back','in_mediation','approved']){
  const calls=[];const p={...payment,status,transaction_amount_refunded:status==='approved'?10:0};
  await reconcilePayment({paymentId:'123',provider:{ready:true,...config,getPayment:async()=>p},admin:{rpc:async(name,args)=>(calls.push({name,args}),{data:{review:true}})}});
  assert.equal(calls[0].name,'mb_reconcile_mp_payment');assert.equal(calls[0].args.p_observation.status,status);
 }
});
test('ambiguous signature duplicates and delimiter injection are rejected',()=>{
 const ts=String(Math.floor(Date.now()/1000)),secret='synthetic-secret',requestId='local-request';
 const v1=createHmac('sha256',secret).update(`id:123;request-id:${requestId};ts:${ts};`).digest('hex');
 const input={signature:`ts=${ts},v1=${v1}`,requestId,dataId:'123',secret};
 assert.equal(verifyMercadoPagoSignature(input),true);
 for(const signature of [`ts=${ts},ts=${ts},v1=${v1}`,`ts=${ts},v1=${v1},unknown=x`])assert.equal(verifyMercadoPagoSignature({...input,signature}),false);
 assert.equal(verifyMercadoPagoSignature({...input,requestId:'bad;ts:1'}),false);
});
test('preference uses authoritative total, stable key, exact test host and expiry',async()=>{
 const calls=[];let response={id:'preference-local',init_point:'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=local'};
 const p=createMercadoPago({enabled:true,accessToken:'synthetic',webhookSecret:'synthetic',collectorId:'456',expectedLiveMode:false,origin:'https://matebreak.test'},async(url,options)=>(calls.push({url,options}),{ok:true,json:async()=>response}));
 const order={id,total:100,email:'local@example.test',items:[{producto_id:1}],expiresAt:new Date(Date.now()+60000).toISOString()};
 const r=await p.createPreference(order);assert.match(r.redirectUrl,/^https:\/\/www\.mercadopago\.com\.ar\//);
 const body=JSON.parse(calls[0].options.body);assert.equal(body.items[0].unit_price,100);assert.equal(body.external_reference,id);assert.equal(calls[0].options.headers['X-Idempotency-Key'],id);assert.equal(calls[0].options.redirect,'error');
 response={id:'bad',init_point:'https://www.mercadopago.com.ar.evil.test/'};await assert.rejects(p.createPreference(order));
 await assert.rejects(p.createPreference({...order,expiresAt:'2000-01-01'}));
 assert.throws(()=>createMercadoPago({enabled:true,accessToken:'x',webhookSecret:'x',collectorId:'456',origin:'https://matebreak.test/evil'}));
});
test('webhook denies unsigned input, ignores forged body and reconciles authoritative GET',async t=>{
 const calls=[];const provider={ready:true,...config,verifyWebhook:i=>i.signature==='valid',getPayment:async p=>(calls.push(['get',p]),payment)};
 const {app}=createApp({url:'https://example.supabase.co',secret:'synthetic',publishable:'synthetic',origin:'https://matebreak.test',production:true},{mercadoPago:provider,admin:{rpc:async(name,args)=>(calls.push([name,args]),{data:{outcome:'aplicado'}})},authFactory:()=>({auth:{getUser:async()=>({data:{user:null}})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const send=signature=>fetch(`http://127.0.0.1:${server.address().port}/api/pagos/mercadopago/webhook?type=payment&data.id=123`,{method:'POST',headers:{'content-type':'application/json','x-signature':signature,'x-request-id':'req'},body:'{"status":"rejected","amount":1}'});
 assert.equal((await send('bad')).status,401);assert.equal(calls.length,0);
 assert.equal((await send('valid')).status,200);assert.equal(calls[0][0],'mb_queue_payment_reconciliation');assert.equal(calls[2][0],'mb_reconcile_mp_payment');assert.equal(calls[2][1].p_observation.status,'approved');
});
