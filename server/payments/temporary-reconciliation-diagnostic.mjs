// TEMPORARY, fixed-resource readonly diagnostic. Remove after capturing result.
import {reconcilePayment} from './reconciliation.mjs';
export async function diagnoseExistingPayment(provider, log) {
 const paymentId='182650336328';
 let stage='authenticated_payment_get', checks={};
 const guardedProvider={...provider,async getPayment(id) {
  const p=await provider.getPayment(id);
  stage='payment_observation';
  checks={id_matches:String(p?.id)===paymentId,
   collector_matches:String(p?.collector_id)===String(provider.collectorId),
   live_mode_is_true:p?.live_mode===true,
   live_mode_matches:p?.live_mode===provider.expectedLiveMode,
   order_matches:p?.external_reference==='1afd463b-2465-4a57-b702-62777682c8af',
   amount_matches:p?.transaction_amount===10000,currency_matches:p?.currency_id==='ARS',
   approved:p?.status==='approved'};
  return p;
 }};
 // Even a valid observation cannot reach the database from this diagnostic.
 const admin={async rpc(){stage='sql_blocked_readonly';throw Error('READONLY_BOUNDARY');}};
 try {await reconcilePayment({admin,provider:guardedProvider,paymentId});}
 catch(error) {
  const codes=new Map([
   ['Payment account/environment mismatch','PAYMENT_ACCOUNT_ENVIRONMENT_MISMATCH'],
   ['Invalid payment identity','INVALID_PAYMENT_IDENTITY'],
   ['Invalid payment amounts/state','INVALID_PAYMENT_AMOUNTS_STATE'],
   ['Payment version missing','PAYMENT_VERSION_MISSING'],
   ['Mercado Pago TEST identity verification failed','TEST_IDENTITY_FAILED'],
   ['READONLY_BOUNDARY','READONLY_BOUNDARY']]);
  log({kind:'temporary_mp_reconciliation_diagnostic',payment_id:paymentId,stage,
   error_code:codes.get(error?.message)||'UPSTREAM_OR_UNKNOWN_ERROR',...checks});
 }
}
