import {reconcilePayment} from '../payments/reconciliation.mjs';
export async function reconcileOnce({admin,provider,enabled=false}){
 if(!enabled||!provider?.ready)throw Error('Reconciliation worker disabled');
 const rpc=async(name,args={})=>{const r=await admin.rpc(name,args);if(r.error)throw Error('Reconciliation persistence failed');return r.data;};
 const job=await rpc('mb_claim_payment_reconciliation');if(!job)return false;
 try{const result=await reconcilePayment({admin,provider,paymentId:job.paymentId});await rpc('mb_finish_payment_reconciliation',{p_claim_id:job.claimId,p_outcome:result?.review?'review':'done'});}
 catch(error){await rpc('mb_finish_payment_reconciliation',{p_claim_id:job.claimId,p_outcome:error.retryable===false?'review':'retry'});throw Error('Reconciliation persisted for retry/review');}
 return true;
}
