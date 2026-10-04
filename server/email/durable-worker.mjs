import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {newCapability,digestCapability} from '../orders/private-access.mjs';
import {renderOrderEmail} from './templates.mjs';
import {emailPayload,mailDigest} from './resend.mjs';
function keyBytes(key){if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error('32-byte email envelope encryption key required');return Buffer.from(key,'hex');}
export function sealMail(payload,{key,eventId}) {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',keyBytes(key),iv);cipher.setAAD(Buffer.from(eventId));
 const body=Buffer.concat([cipher.update(payload,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');
}
export function openMail(box,{key,eventId}) {
 const [version,iv,tag,body,...extra]=String(box).split('.');if(version!=='v1'||extra.length||!iv||!tag||!body)throw Error('Invalid email envelope');
 const cipher=createDecipheriv('aes-256-gcm',keyBytes(key),Buffer.from(iv,'base64url'));cipher.setAAD(Buffer.from(eventId));cipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([cipher.update(Buffer.from(body,'base64url')),cipher.final()]).toString('utf8');
}
export async function deliverDurableOrderEmail({admin,adapter,allowReal=false,encryptionKey,from,replyTo,testRecipient,eventId,rolloutAfter,origin,contact,whatsapp,storageOrigin,now=Date.now}) {
 if(!adapter?.mock&&(!allowReal||!adapter?.ready))throw Error('Real email transport disabled');
 keyBytes(encryptionKey);
 const rpc=async(name,args={})=>{const r=await admin.rpc(name,args);if(r.error)throw Error('Email persistence failed');return r.data;};
 if(!adapter.mock&&!eventId&&!rolloutAfter)throw Error('Explicit event or rollout cutoff required');
 const event=await rpc(eventId||rolloutAfter?'mb_claim_order_email_controlled':'mb_claim_order_email',eventId||rolloutAfter?{p_event_id:eventId??null,p_after:rolloutAfter??null}:{});if(!event)return false;
 try{
  let envelope=await rpc('mb_email_delivery_for_claim',{p_claim_id:event.claim_id});
  if(!envelope){
   const token=newCapability(),message=renderOrderEmail({kind:event.kind,order:event.order,orderUrl:origin+'/src/pages/pedido.html#'+token,origin,contact,whatsapp,storageOrigin});
   const payload=emailPayload({from,to:testRecipient||event.email,replyTo,message});
   envelope=await rpc('mb_prepare_email_delivery',{p_claim_id:event.claim_id,p_ciphertext:sealMail(payload,{key:encryptionKey,eventId:event.id}),p_digest:mailDigest(payload),p_link_hash:digestCapability(token)});
  }
  // Margin below Resend's 24h retention; retries never refresh this timestamp.
  if(!Number.isFinite(Date.parse(envelope.prepared_at))||now()-Date.parse(envelope.prepared_at)>=23*3600000||Date.parse(envelope.prepared_at)>now()+60000)throw Error('Email idempotency window requires review');
  const payload=openMail(envelope.ciphertext,{key:encryptionKey,eventId:event.id});if(mailDigest(payload)!==envelope.digest)throw Error('Email envelope integrity failed');
  const result=await adapter.send({idempotencyKey:'order-email/'+event.id,payload,digest:envelope.digest});
  if(result.accepted!==true||!result.providerId)throw Error('Ambiguous email acceptance');
  await rpc('mb_finish_email_delivery',{p_claim_id:event.claim_id,p_provider_id:result.providerId});
 }catch(error){
  await rpc('mb_finish_order_email',{p_claim_id:event.claim_id,p_outcome:error.safeToRetry===true?'retry':'review'});
  throw Error('Email delivery stopped in persisted retry/review state');
 }
 return true;
}
