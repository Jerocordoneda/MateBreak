import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createResend,emailPayload,mailDigest,verifyResendWebhook} from '../server/email/resend.mjs';
import {sealMail,openMail,deliverDurableOrderEmail} from '../server/email/durable-worker.mjs';
import {renderAuthTemplate} from '../server/email/auth-templates.mjs';
import {confirmWholesaleParcels} from '../server/shipping/wholesale-parcels.mjs';
import {createCorreoArgentino} from '../server/shipping/correo-argentino.mjs';
import {requestPasswordRecovery,completePasswordRecovery} from '../server/email/password-recovery.mjs';
import {recordResendReceipt} from '../server/email/receipts.mjs';
const uuid='11111111-1111-4111-8111-111111111111',key='a'.repeat(64);
const payload=emailPayload({from:'orders@example.test',to:'local@example.test',message:{subject:'Local',html:'<p>Local</p>',text:'Local'}}),digest=mailDigest(payload);
test('Resend disabled gate, same bytes/key and sanitized acceptance errors',async()=>{
 let calls=0;const disabled=createResend({apiKey:'synthetic'},()=>{calls++;throw Error('No network');});await assert.rejects(disabled.send({idempotencyKey:uuid,payload,digest}),/failed/);assert.equal(calls,0);
 for(const status of [200,400,401,409,429,500]){
  const adapter=createResend({enabled:true,apiKey:'synthetic'},async(url,o)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(o.body,payload);assert.equal(o.headers['Idempotency-Key'],uuid);assert.equal(o.redirect,'error');return{ok:status===200,status,json:async()=>({id:uuid,secret:'sensitive'})};});
  if(status===200)assert.deepEqual(await adapter.send({idempotencyKey:uuid,payload,digest}),{accepted:true,providerId:uuid});
  else await assert.rejects(adapter.send({idempotencyKey:uuid,payload,digest}),e=>e.safeToRetry===(status===429)&&!JSON.stringify(e).includes('sensitive'));
 }
 const adapter=createResend({enabled:true,apiKey:'synthetic'},async()=>{throw Error('private-address');});await assert.rejects(adapter.send({idempotencyKey:uuid,payload,digest}),e=>e.type==='ambiguous'&&!e.message.includes('private-address'));
 assert.throws(()=>emailPayload({from:'orders@example.test',to:'invalid\r\naddress',message:{}}));
});
test('encrypted payload authenticates event binding, key and bytes',()=>{
 const box=sealMail(payload,{key,eventId:uuid});assert.ok(!box.includes('example.test'));assert.equal(openMail(box,{key,eventId:uuid}),payload);
 assert.throws(()=>openMail(box,{key,eventId:'another-event'}));assert.throws(()=>openMail(box,{key:'b'.repeat(64),eventId:uuid}));
 assert.throws(()=>openMail(box.slice(0,-8),{key,eventId:uuid}));
});
test('durable worker keeps exact payload and capability across a rejected 429 retry',async()=>{
 let envelope=null,links=0,sends=0;const messages=[],outcomes=[];
 const event={id:uuid,claim_id:'claim-local',kind:'received',email:'local@example.test',order:{id:uuid,numero:'LOCAL',items:[],pagos:[],direccion_entrega:{destinatario:{nombre:'Local'}}}};
 const admin={rpc:async(name,args)=>{
  if(name==='mb_claim_order_email')return{data:event};
  if(name==='mb_email_delivery_for_claim')return{data:envelope};
  if(name==='mb_prepare_email_delivery'){links++;envelope={ciphertext:args.p_ciphertext,digest:args.p_digest,prepared_at:new Date().toISOString()};return{data:envelope};}
  outcomes.push([name,args]);return{data:null};
 }};
 const adapter={mock:true,send:async input=>{messages.push(input);if(sends++===0)throw Object.assign(Error('429'),{safeToRetry:true});return{accepted:true,providerId:uuid};}};
 const options={admin,adapter,encryptionKey:key,from:'orders@example.test',origin:'https://matebreak.test'};
 await assert.rejects(deliverDurableOrderEmail(options));assert.equal(outcomes[0][1].p_outcome,'retry');
 await deliverDurableOrderEmail(options);assert.equal(links,1);assert.deepEqual(messages[0],messages[1]);assert.equal(outcomes.at(-1)[0],'mb_finish_email_delivery');
 envelope.prepared_at=new Date(Date.now()-24*3600000).toISOString();await assert.rejects(deliverDurableOrderEmail(options));assert.equal(messages.length,2);assert.equal(outcomes.at(-1)[1].p_outcome,'review');
 await assert.rejects(deliverDurableOrderEmail({...options,adapter:{ready:true,mock:false}}),/disabled/);
});
test('Resend signature authenticates raw bytes, rejects expiry/reformatted body',()=>{
 const rawBody=Buffer.from('{"type":"email.delivered"}'),id='msg_local',timestamp=String(Math.floor(Date.now()/1000)),secret='whsec_'+Buffer.alloc(32,1).toString('base64');
 const signature='v1,'+createHmac('sha256',Buffer.alloc(32,1)).update(`${id}.${timestamp}.`).update(rawBody).digest('base64');
 const input={rawBody,id,timestamp,secret,signature};assert.equal(verifyResendWebhook(input),true);
 assert.equal(verifyResendWebhook({...input,rawBody:Buffer.from('{ "type": "email.delivered" }')}),false);assert.equal(verifyResendWebhook({...input,now:Date.now()+301000}),false);
});
test('signed email receipts persist only minimized fields; forged body denied',async()=>{
 const calls=[],rawBody=Buffer.from(JSON.stringify({type:'email.bounced',created_at:new Date().toISOString(),data:{email_id:uuid,to:['private@example.test']}})),id='msg_local',timestamp=String(Math.floor(Date.now()/1000)),bytes=Buffer.alloc(32,1),secret='whsec_'+bytes.toString('base64');
 const signature='v1,'+createHmac('sha256',bytes).update(`${id}.${timestamp}.`).update(rawBody).digest('base64');
 const args={rawBody,secret,headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':signature},admin:{rpc:async(name,data)=>(calls.push([name,data]),{data:{matched:true}})}};
 await recordResendReceipt(args);assert.equal(calls[0][0],'mb_record_email_receipt');assert.ok(!JSON.stringify(calls).includes('private@example.test'));
 await assert.rejects(recordResendReceipt({...args,rawBody:Buffer.from('{}')}),e=>e.status===401);assert.equal(calls.length,1);
});
test('Auth templates preserve one-use confirmation and recovery protocols with HTTPS brand origin',()=>{
 for(const kind of ['confirmation','recovery']){const template=renderAuthTemplate({kind,origin:'https://matebreak.test'});if(kind==='recovery'){assert.match(template.html,/href="{{ \.ConfirmationURL }}"/);assert.doesNotMatch(template.html,/TokenHash|RedirectTo/);}else{assert.match(template.html,/https:\/\/matebreak.test\/auth\/confirmar#token_hash={{ \.TokenHash }}/);assert.match(template.html,/type=email/);assert.match(template.html,/if eq \.RedirectTo/);}assert.match(template.subject,/MateBreak/);assert.doesNotMatch(template.html,/<script/);}
 assert.throws(()=>renderAuthTemplate({kind:'recovery',origin:'https://matebreak.test/path'}));
});
test('operator wholesale measurements allocate exact cents with stable bulto IDs',()=>{
 const input={orderId:uuid,actorId:uuid,measuredAt:new Date().toISOString(),parcels:[{weight:1000,height:10,width:20,length:30},{weight:1500,height:15,width:20,length:30},{weight:2000,height:20,width:20,length:30}],merchandiseValue:100.01};
 const a=confirmWholesaleParcels(input),b=confirmWholesaleParcels(input);assert.deepEqual(a,b);assert.deepEqual(a.parcels.map(p=>p.declaredValue),[33.34,33.34,33.33]);assert.equal(a.parcels[2].extOrderId,`MB-${uuid}-3`);
 for(const patch of [{actorId:'untrusted'},{parcels:[]},{parcels:[{weight:26000,height:10,width:20,length:30}]},{measuredAt:'2030-01-01'},{merchandiseValue:1.001}])assert.throws(()=>confirmWholesaleParcels({...input,...patch}));
});
test('MiCorreo rejects invalid contact/sender before any transport',async()=>{
 let calls=0;const provider=createCorreoArgentino({username:'synthetic',password:'synthetic',customerId:'local'},()=>{calls++;throw Error('No network');});
 const input={extOrderId:'MB-local-1',recipient:{name:'Local',email:'invalid'},shipping:{deliveryType:'D',weight:100,height:10,width:10,length:10,address:{streetName:'Local',streetNumber:'1',city:'Local',provinceCode:'B',postalCode:'7000'},declaredValue:100}};
 await assert.rejects(provider.importShipment(input));await assert.rejects(provider.importShipment({...input,recipient:{name:'Local',email:'local@example.test'},sender:{name:'Invalid',email:'local@example.test'}}));assert.equal(calls,0);
});
test('recovery actions require explicit activation and live session; exact redirect and generic message',async()=>{
 const calls=[];const auth={auth:{resetPasswordForEmail:async(...args)=>(calls.push(args),{error:null}),getUser:async()=>({data:{user:{id:uuid}}}),updateUser:async data=>(calls.push(data),{error:null})}};
 await assert.rejects(requestPasswordRecovery({auth,email:'local@example.test',origin:'https://matebreak.test'}));assert.equal(calls.length,0);
 const result=await requestPasswordRecovery({auth,email:' LOCAL@example.test ',origin:'https://matebreak.test',enabled:true});assert.ok(result.mensaje);assert.deepEqual(calls[0],['local@example.test',{redirectTo:'https://matebreak.test/auth/recuperar'}]);
 await assert.rejects(completePasswordRecovery({auth,password:'local-fixture-only',enabled:true,verifyLiveSession:async()=>false}),e=>e.status===401);assert.equal(calls.length,1);
 await completePasswordRecovery({auth,password:'local-fixture-only',enabled:true,verifyLiveSession:async()=>true});assert.deepEqual(calls[1],{password:'local-fixture-only'});
});
