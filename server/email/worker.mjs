import {newCapability,digestCapability} from '../orders/private-access.mjs';
import {renderOrderEmail} from './templates.mjs';
export function createMockMailAdapter(){
 const sent=new Map();
 return {mock:true,sent,async send({idempotencyKey,message}){if(!sent.has(idempotencyKey))sent.set(idempotencyKey,message);return {accepted:true};}};
}
// Explicit invocation only; createApp never starts a worker or sends mail.
// A real adapter must classify pre-acceptance failures and support the event key.
export async function deliverOneOrderEmail({admin,adapter,origin,contact,whatsapp,storageOrigin}){
 if(!adapter?.mock)throw Error('Only the mock email adapter is approved in this iteration');
 const rpc=async(name,args={})=>{const r=await admin.rpc(name,args);if(r.error)throw Error('Email persistence failed');return r.data;};
 const event=await rpc('mb_claim_order_email');if(!event)return false;
 try{
  const token=newCapability();await rpc('mb_issue_order_link',{p_claim_id:event.claim_id,p_link_hash:digestCapability(token)});
  const message=renderOrderEmail({kind:event.kind,order:event.order,orderUrl:origin+'/src/pages/pedido.html#'+token,origin,contact,whatsapp,storageOrigin});
  const result=await adapter.send({idempotencyKey:event.id,to:event.email,message});
  await rpc('mb_finish_order_email',{p_claim_id:event.claim_id,p_outcome:result.accepted?'sent':'review'});
 }catch(error){
  await rpc('mb_finish_order_email',{p_claim_id:event.claim_id,p_outcome:error.safeToRetry===true?'retry':'review'});
  // No raw provider errors, email addresses, tokens or HTML are logged.
  throw Error('Email delivery did not complete; persisted retry/review state');
 }
 return true;
}
