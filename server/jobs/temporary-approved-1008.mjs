// TEMPORARY owner-authorized one-job recovery. Remove after verified completion.
// No endpoint, scheduler, seed/upsert, purchase or direct commercial UPDATE.
import {stagingMpTestAllowed} from '../config/staging-mp-test.mjs';
import {reconcileOnce} from './reconcile-payments.mjs';
const paymentId='182650336328',orderId='1afd463b-2465-4a57-b702-62777682c8af';
export async function runApproved1008Once({config,admin,provider,log}){
 if(!stagingMpTestAllowed(config)||config.mercadoPago.expectedLiveMode!==true||
  config.stagingProjectRef!=='rxccjczyywhewqqdfgxm'||config.origin!=='https://matebreak-staging.vercel.app')
  throw Error('APPROVED_1008_CONTEXT_REJECTED');
 let observation,outcome,stage='claim_existing_job';
 const guardedAdmin={async rpc(name,args={}){
  if(!['mb_claim_payment_reconciliation','mb_reconcile_mp_payment','mb_finish_payment_reconciliation'].includes(name))throw Error('APPROVED_1008_RPC_REJECTED');
  if(name==='mb_reconcile_mp_payment'){
   stage='reconcile_existing_job';const o=args.p_observation;
   if(o?.id!==paymentId||o.orderId!==orderId||o.amount!==10000||o.currency!=='ARS'||o.collectorId!=='3741487042'||o.environment!=='test')throw Error('APPROVED_1008_OBSERVATION_REJECTED');
   observation=o;
  }
  const r=await admin.rpc(name,args);
  if(name==='mb_claim_payment_reconciliation'&&r.data&&r.data.paymentId!==paymentId)throw Error('APPROVED_1008_JOB_REJECTED');
  if(name==='mb_reconcile_mp_payment')outcome=r.data;
  return r;
 }};
 const guardedProvider={...provider,async getPayment(id){
  stage='authenticated_payment_get';if(id!==paymentId)throw Error('APPROVED_1008_JOB_REJECTED');return provider.getPayment(id);
 }};
 try{
  const processed=await reconcileOnce({admin:guardedAdmin,provider:guardedProvider,enabled:true});
  if(!processed){log({kind:'approved_1008_reconciliation',payment_id:paymentId,processed:false});return;}
  if(outcome?.review!==true||!['revision_manual','duplicate'].includes(outcome.outcome))throw Error('APPROVED_1008_REVIEW_EXPECTATION_FAILED');
  // Verify SQL idempotency with the exact already-authenticated observation.
  // No second queue entry, notification or payment GET is created.
  stage='verify_duplicate';
  const duplicate=await admin.rpc('mb_reconcile_mp_payment',{p_observation:observation});
  if(duplicate.error||duplicate.data?.outcome!=='duplicate'||duplicate.data?.review!==true)throw Error('APPROVED_1008_DUPLICATE_EXPECTATION_FAILED');
  log({kind:'approved_1008_reconciliation',payment_id:paymentId,processed:true,
   reconciliation_executed:true,review:true,outcome:outcome.outcome,duplicate:true});
 }catch{
  // No upstream error message/body, claim key, PII or credentials are emitted.
  log({kind:'approved_1008_reconciliation',payment_id:paymentId,stage,error_code:'APPROVED_1008_RECOVERY_FAILED'});
 }
}
