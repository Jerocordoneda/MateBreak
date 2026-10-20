import {createHash} from 'node:crypto';
import {safeCardPresentation} from './card-presentation.mjs';
import {isVerifiedStagingTestPayment} from './mercadopago.mjs';
import {STAGING_MP_TEST_SELLER} from '../config/staging-mp-test.mjs';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states=new Set(['pending','approved','authorized','in_process','in_mediation','rejected','cancelled','refunded','charged_back']);
const cents=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&Number.isSafeInteger(Math.round(v*100))&&Math.abs(v*100-Math.round(v*100))<0.00001;
// Authenticated payment response, minimized: never persist payer/card PII.
export function paymentObservation(payment,{paymentId,collectorId,environment,expectedLiveMode}={}) {
 if(!['test','production'].includes(environment)||typeof expectedLiveMode!=='boolean'||!/^\d{1,30}$/.test(String(collectorId||'')))throw Error('Payment reconciliation configuration missing');
 if(environment==='test'&&expectedLiveMode===true&&
  (String(collectorId)!==STAGING_MP_TEST_SELLER||!isVerifiedStagingTestPayment(payment)))
  throw Error('Payment TEST live-mode provenance missing');
 if(!/^\d{1,30}$/.test(String(paymentId||''))||String(payment?.id)!==String(paymentId)||!uuid.test(payment?.external_reference||''))throw Error('Invalid payment identity');
 if(String(payment.collector_id)!==String(collectorId)||payment.live_mode!==expectedLiveMode)throw Error('Payment account/environment mismatch');
 if(!states.has(payment.status)||payment.currency_id!=='ARS'||!cents(payment.transaction_amount)||payment.transaction_amount<=0||!cents(payment.transaction_amount_refunded??0)||Number(payment.transaction_amount_refunded??0)>payment.transaction_amount)throw Error('Invalid payment amounts/state');
 if(typeof payment.date_last_updated!=='string'||!Number.isFinite(Date.parse(payment.date_last_updated)))throw Error('Payment version missing');
 const data={id:String(payment.id),orderId:payment.external_reference.toLowerCase(),status:payment.status,amount:payment.transaction_amount,currency:'ARS',refunded:payment.transaction_amount_refunded??0,updatedAt:new Date(payment.date_last_updated).toISOString(),environment,collectorId:String(collectorId),card:safeCardPresentation(payment)};
 return {...data,digest:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
}
export async function reconcilePayment({admin,provider,paymentId}) {
 if(!provider?.ready)throw Error('Payment provider disabled');
 const payment=await provider.getPayment(paymentId);let observation;
 try{observation=paymentObservation(payment,{paymentId,collectorId:provider.collectorId,environment:provider.environment,expectedLiveMode:provider.expectedLiveMode});}catch(error){error.retryable=false;throw error;}
 const result=await admin.rpc('mb_reconcile_mp_payment',{p_observation:observation});
 if(result.error)throw Object.assign(Error('Payment reconciliation persistence failed'),{retryable:result.error.code!=='P0001'});
 // Use the committed authoritative observation, never the notification body.
 // A failure leaves the durable job eligible for normal reconciliation retry.
 const completed=await admin.rpc('mb_complete_payment_reconciliation',{p_payment_id:paymentId});
 if(completed.error)throw Error('Payment reconciliation completion failed');
 return {...result.data,review:completed.data?.review??result.data?.review};
}
