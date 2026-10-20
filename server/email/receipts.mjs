import {mailDigest,verifyResendWebhook} from './resend.mjs';
const allowed=new Set(['email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed']);
// Prepared backend handler; deliberately has no registered HTTP endpoint.
// Persist minimal signed facts. Receipt arrival may precede send acknowledgement.
export async function recordResendReceipt({admin,rawBody,headers,secret,now=Date.now()}) {
 if(!verifyResendWebhook({rawBody,id:headers?.['svix-id'],timestamp:headers?.['svix-timestamp'],signature:headers?.['svix-signature'],secret,now}))throw Object.assign(Error('Invalid email receipt signature'),{status:401});
 let event;try{event=JSON.parse(rawBody);}catch{throw Error('Invalid email receipt');}
 if(!allowed.has(event.type)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.data?.email_id||'')||typeof event.created_at!=='string'||!Number.isFinite(Date.parse(event.created_at)))throw Error('Invalid email receipt');
 const saved=await admin.rpc('mb_record_email_receipt',{p_notification_id:headers['svix-id'],p_provider_id:event.data.email_id,p_type:event.type,p_digest:mailDigest(rawBody),p_occurred_at:event.created_at});
 if(saved.error)throw Error('Email receipt persistence failed');
 return saved.data;
}
