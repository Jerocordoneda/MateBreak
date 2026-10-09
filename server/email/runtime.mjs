import express from 'express';
import {createResend} from './resend.mjs';
import {recordResendReceipt} from './receipts.mjs';
import {deliverDurableOrderEmail} from './durable-worker.mjs';
export function emailRuntime(app,{admin,config,adapter}){
 const mail=config.email??{};
 const provider=adapter??createResend({apiKey:mail.apiKey,enabled:mail.enabled===true});
 // Raw body is captured before JSON/Auth middleware. Signature, not Origin,
 // authenticates receipts. No contents/addresses are logged.
 app.post('/api/emails/resend/recibos',express.raw({type:'application/json',limit:'256kb'}),async(req,res)=>{
  if(!mail.receiptsEnabled||!mail.webhookSecret)return res.status(503).json({error:'Recibos no habilitados'});
  try{const result=await recordResendReceipt({admin,rawBody:req.body,headers:req.headers,secret:mail.webhookSecret});res.json({ok:true,duplicate:result.duplicate});}
  catch(e){res.status(e.status===401?401:503).json({error:'No se pudo validar o guardar el recibo'});}
 });
 return {async runEmailOnce(){
  if(!mail.workerEnabled)throw Error('Email worker disabled');
  if(mail.testRecipient&&!['mate.break32@gmail.com','jerocordoneda@gmail.com'].includes(mail.testRecipient.toLowerCase()))throw Error('Unauthorized test recipient');
  return deliverDurableOrderEmail({admin,adapter:provider,allowReal:mail.enabled===true,encryptionKey:mail.encryptionKey,from:mail.from,replyTo:mail.replyTo,testRecipient:mail.testRecipient,eventId:mail.eventId,rolloutAfter:mail.rolloutAfter,origin:config.origin,contact:mail.replyTo});
 }};
}
