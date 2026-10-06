import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseExistingPayment} from '../server/payments/temporary-reconciliation-diagnostic.mjs';
const payment={id:182650336328,collector_id:3741487042,live_mode:true,
 external_reference:'1afd463b-2465-4a57-b702-62777682c8af',transaction_amount:10000,
 currency_id:'ARS',status:'approved',date_last_updated:'2026-10-06T11:27:26Z'};
test('fixed readonly diagnostic proves guard without persisting or exposing raw fields',async()=>{
 let event;await diagnoseExistingPayment({ready:true,collectorId:'3741487042',environment:'test',expectedLiveMode:false,
  getPayment:async id=>{assert.equal(id,'182650336328');return {...payment,payer:{email:'private@example.invalid'}};}},e=>event=e);
 assert.equal(event.stage,'payment_observation');assert.equal(event.error_code,'PAYMENT_ACCOUNT_ENVIRONMENT_MISMATCH');
 assert.equal(event.collector_matches,true);assert.equal(event.live_mode_matches,false);
 assert.equal(JSON.stringify(event).includes('private'),false);
});
test('valid observation stops at readonly boundary',async()=>{
 let event;await diagnoseExistingPayment({ready:true,collectorId:'3741487042',environment:'test',expectedLiveMode:false,
  getPayment:async()=>({...payment,live_mode:false})},e=>event=e);
 assert.equal(event.stage,'sql_blocked_readonly');assert.equal(event.error_code,'READONLY_BOUNDARY');
});
test('unknown upstream error is never logged verbatim',async()=>{
 let event;await diagnoseExistingPayment({ready:true,getPayment:async()=>{throw Error('Authorization SECRET PII');}},e=>event=e);
 assert.equal(event.stage,'authenticated_payment_get');assert.equal(event.error_code,'UPSTREAM_OR_UNKNOWN_ERROR');
 assert.equal(JSON.stringify(event).includes('SECRET'),false);
});
