import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
const mailbox=v=>typeof v==='string'&&v.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v);
export class MailDeliveryError extends Error {
 constructor(type,{safeToRetry=false,status=null}={}){super('Email provider delivery failed');Object.assign(this,{type,safeToRetry,status});}
}
export function emailPayload({from,to,message}) {
 if(!mailbox(from)||!mailbox(to)||typeof message?.subject!=='string'||!message.subject||message.subject.length>200||/[\r\n]/.test(message.subject)||typeof message.html!=='string'||typeof message.text!=='string'||message.html.length>200000||message.text.length>100000)throw new MailDeliveryError('invalid_payload');
 return JSON.stringify({from,to:[to],subject:message.subject,html:message.html,text:message.text});
}
export const mailDigest=payload=>createHash('sha256').update(payload).digest('hex');
// Never wired into createApp or a scheduler. Disabled unless explicitly opted in.
export function createResend({apiKey,enabled=false}={},fetcher=fetch) {
 if(enabled&&(!apiKey||/[\r\n]/.test(apiKey)))throw Error('Resend server credential required');
 return {mock:false,ready:Boolean(enabled&&apiKey),async send({idempotencyKey,payload,digest}){
  if(!enabled||!apiKey)throw new MailDeliveryError('disabled');
  if(typeof idempotencyKey!=='string'||!/^[A-Za-z0-9/_-]{1,256}$/.test(idempotencyKey)||typeof payload!=='string'||mailDigest(payload)!==digest)throw new MailDeliveryError('invalid_envelope');
  let data;try{data=JSON.parse(payload);}catch{throw new MailDeliveryError('invalid_payload');}
  if(emailPayload({from:data.from,to:data.to?.length===1?data.to[0]:null,message:data})!==payload)throw new MailDeliveryError('invalid_payload');
  let response;try{response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:payload});}catch{throw new MailDeliveryError('ambiguous');}
  // A timeout/5xx/malformed success can follow provider acceptance. Review it.
  if(!response.ok)throw new MailDeliveryError(response.status===429?'rate_limit':response.status>=500?'ambiguous':response.status===409?'idempotency_conflict':'rejected',{status:response.status,safeToRetry:response.status===429});
  let result;try{result=await response.json();}catch{throw new MailDeliveryError('ambiguous');}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result?.id||''))throw new MailDeliveryError('ambiguous');
  return {accepted:true,providerId:result.id};
 }};
}
// Raw bytes must be captured BEFORE JSON parsing. Svix signs id.timestamp.body.
export function verifyResendWebhook({rawBody,id,timestamp,signature,secret,now=Date.now()}) {
 if(!Buffer.isBuffer(rawBody)||rawBody.length>256000||typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)||typeof timestamp!=='string'||!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp)*1000)>300000||typeof signature!=='string'||typeof secret!=='string'||!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret))return false;
 const key=Buffer.from(secret.slice(6),'base64');if(key.length<16)return false;
 const expected=createHmac('sha256',key).update(`${id}.${timestamp}.`).update(rawBody).digest();
 return signature.split(' ').some(s=>{const [version,value]=s.split(',');if(version!=='v1'||!value||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))return false;const decoded=Buffer.from(value,'base64');return decoded.length===expected.length&&timingSafeEqual(expected,decoded);});
}
