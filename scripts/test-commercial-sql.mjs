import {createWholesaleDatabase,seedWholesale,literal as lit} from './wholesale-local-runtime.mjs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {paymentObservation} from '../server/payments/reconciliation.mjs';
import {sealMail} from '../server/email/durable-worker.mjs';
import {deliverDurableOrderEmail} from '../server/email/durable-worker.mjs';
import {createResend} from '../server/email/resend.mjs';
import {createCorreoArgentino} from '../server/shipping/correo-argentino.mjs';
import {runShipmentJob} from '../server/shipping/jobs.mjs';
import {recordVerifiedDispatch} from '../server/shipping/tracking.mjs';
import {reconcilePayment} from '../server/payments/reconciliation.mjs';
const emailPayloadForTest='{"from":"orders@example.test","to":["local@example.test"],"subject":"Local fixture","html":"<p>Local</p>","text":"Local"}';
const db=createWholesaleDatabase(),q=db.query;
try{
 seedWholesale(q);
 for(const table of ['mp_payment_observation','order_financial_hold','order_email_delivery','order_email_receipt']){
  assert.equal(q(`select relrowsecurity from pg_class where oid='private.${table}'::regclass;`),'t');
  for(const role of ['anon','authenticated'])assert.throws(()=>q(`set role ${role};select * from private.${table};`),/permission denied/);
 }
 for(const signature of ['public.mb_reconcile_mp_payment(jsonb)','public.mb_email_delivery_for_claim(uuid)','public.mb_prepare_email_delivery(uuid,text,text,text)','public.mb_finish_email_delivery(uuid,uuid)','public.mb_record_email_receipt(text,uuid,text,text,timestamp with time zone)']){
  for(const role of ['anon','authenticated'])assert.equal(q(`select has_function_privilege(${lit(role)},${lit(signature)},'execute');`),'f');
  assert.equal(q(`select has_function_privilege('service_role',${lit(signature)},'execute');`),'t');
  assert.equal(q(`select prosecdef from pg_proc where oid=${lit(signature)}::regprocedure;`),'f');
 }
 const create=token=>{
  q(`select public.mb_comercio(${lit(token)},null,'variante','{"variante_id":900001,"cantidad":1}');`);
  return JSON.parse(q(`select public.mb_checkout_minorista(${lit(token)},null,${lit({idempotencia:randomUUID(),pago:'mercadopago',envio:'retiro',destinatario:{nombre:'Local',apellido:'Fixture',email:'local@example.test',telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Local',numero:'123'}})}::jsonb);`));
 };
 const observation=(order,pid,status='approved',patch={})=>paymentObservation({id:pid,collector_id:456,live_mode:false,external_reference:order.id,currency_id:'ARS',transaction_amount:Number(order.total),transaction_amount_refunded:0,status,date_last_updated:'2026-10-04T07:00:00Z',...patch},{paymentId:String(pid),collectorId:'456',environment:'test',expectedLiveMode:false});
 const apply=o=>`set role service_role;select public.mb_reconcile_mp_payment(${lit(o)}::jsonb);`;
 for(const role of ['anon','authenticated']){
  assert.throws(()=>q(`set role ${role};select public.mb_reconcile_mp_payment('{}');`),/permission denied/);
  assert.throws(()=>q(`set role ${role};select * from private.order_financial_hold;`),/permission denied/);
 }
 const a=create('1'.repeat(64)),o=observation(a,101);
 const results=await Promise.all([db.parallel(apply(o)),db.parallel(apply(o))]);
 assert.ok(results.some(r=>r.includes('duplicate')));assert.ok(results.some(r=>r.includes('aplicado')));
 assert.equal(q(`select estado from public.pedido where id=${lit(a.id)};`),'pagado');assert.equal(q('select count(*) from private.mp_payment_observation;'),'1');
 const stock=q('select stock from public.producto_simple where id_producto=900002');
 const refund=observation(a,101,'refunded',{transaction_amount_refunded:Number(a.total),date_last_updated:'2026-10-04T07:01:00Z'});
 assert.match(q(apply(refund)),/revision_manual/);assert.match(q(apply(o)),/stale/);
 assert.equal(q('select stock from public.producto_simple where id_producto=900002'),stock);
 assert.throws(()=>q(`update public.pedido set estado='en_preparacion' where id=${lit(a.id)};`),/Revision financiera/);
 assert.equal(q('select count(*) from private.order_financial_hold'),'1');
 const b=create('2'.repeat(64));
 assert.match(q(apply(observation(b,102,'rejected'))),/observado/);
 assert.equal(q(`select estado from public.pedido where id=${lit(b.id)}`),'pendiente_pago');
 assert.match(q(apply(observation(b,102,'approved',{date_last_updated:'2026-10-04T07:02:00Z'}))),/aplicado/);
 const c=create('3'.repeat(64));q(`update public.pedido set reserva_hasta=now()-interval '1 minute' where id=${lit(c.id)};select public.mb_expirar_reservas();`);
 const released=q('select stock from public.producto_simple where id_producto=900002');
 assert.match(q(apply(observation(c,103))),/revision_manual/);assert.equal(q('select stock from public.producto_simple where id_producto=900002'),released);
 const d=create('4'.repeat(64));assert.match(q(apply(observation(d,104,'approved',{transaction_amount_refunded:1}))),/revision_manual/);
 const e=create('5'.repeat(64));assert.match(q(apply(observation(e,105,'charged_back'))),/revision_manual/);
 const f=create('6'.repeat(64));assert.match(q(apply(observation(f,106,'pending'))),/observado/);assert.match(q(apply(observation(f,106,'approved'))),/version_conflict|revision_manual/);
 const claims=await Promise.all([db.parallel('set role service_role;select public.mb_claim_order_email();'),db.parallel('set role service_role;select public.mb_claim_order_email();')]);
 const events=claims.filter(Boolean).map(JSON.parse);assert.notEqual(events[0]?.id,events[1]?.id);
 const event=events[0],box=sealMail(emailPayloadForTest,{key:'a'.repeat(64),eventId:event.id});
 const prepare=`set role service_role;select public.mb_prepare_email_delivery(${lit(event.claim_id)},${lit(box)},repeat('a',64),repeat('b',64));`;
 const first=q(prepare),again=q(prepare);assert.equal(first,again);assert.equal(q(`select count(*) from private.order_access where link_hash=repeat('b',64);`),'1');
 assert.throws(()=>q(`update private.order_email_delivery set digest=repeat('c',64);`),/Envelope inmutable/);
 assert.throws(()=>q(`set role anon;select public.mb_email_delivery_for_claim(${lit(event.claim_id)});`),/permission denied/);
 q(`set role service_role;select public.mb_finish_email_delivery(${lit(event.claim_id)},'77777777-7777-4777-8777-777777777777');`);
 assert.equal(q(`select state from private.order_email_event where id=${lit(event.id)};`),'sent');
 assert.equal(q(`select public.mb_email_delivery_for_claim(${lit(event.claim_id)});`),'');
 assert.throws(()=>q(prepare),/Claim no vigente/);
 const receipt=`set role service_role;select public.mb_record_email_receipt('msg_local','77777777-7777-4777-8777-777777777777','email.delivered',repeat('a',64),now());`;
 assert.match(q(receipt),/"matched": true/);assert.match(q(receipt),/"duplicate": true/);
 assert.throws(()=>q(receipt.replace("repeat('a',64)","repeat('c',64)")),/Receipt conflictivo/);
 // All adapters below have injected fake transports. No network provider calls.
 const g=create('8'.repeat(64)),rpcNames=new Set(['mb_reconcile_mp_payment','mb_claim_shipment','mb_finish_shipment','mb_record_verified_dispatch','mb_claim_order_email','mb_claim_order_email_controlled','mb_email_delivery_for_claim','mb_prepare_email_delivery','mb_finish_email_delivery','mb_finish_order_email']);
 const admin={rpc:async(name,args={})=>{
  assert.ok(rpcNames.has(name));assert.ok(Object.keys(args).every(k=>/^p_[a-z_]+$/.test(k)));
  const raw=q(`set role service_role;select public.${name}(${Object.entries(args).map(([k,v])=>k+'=>'+lit(v)).join(',')});`);return{data:raw?JSON.parse(raw):null,error:null};
 }};
 const snapshot={version:1,environment:'production',customerId:'synthetic-customer',deliveryType:'D',recipient:{name:'Local Fixture',email:'local@example.test'},address:{streetName:'Local',streetNumber:'1',city:'Tandil',provinceCode:'B',postalCode:'7000'},parcels:[{dimensions:{weight:1000,height:10,width:20,length:30},declaredValue:Number(g.total)}]};
 q(`update public.envio set snapshot=${lit(snapshot)}::jsonb where pedido_id=${lit(g.id)};insert into private.envio_bulto(pedido_id,bulto,ext_order_id)values(${lit(g.id)},1,${lit('MB-'+g.id+'-1')});`);
 await reconcilePayment({admin,paymentId:'108',provider:{ready:true,collectorId:'456',environment:'test',expectedLiveMode:false,getPayment:async()=>({id:108,collector_id:456,live_mode:false,external_reference:g.id,transaction_amount:Number(g.total),currency_id:'ARS',status:'approved',date_last_updated:'2026-10-04T07:03:00Z'})}});
 const imports=[];
 const correo=createCorreoArgentino({environment:'production',username:'synthetic',password:'synthetic',customerId:'synthetic-customer'},async(url,options)=>{
  assert.match(url,/^https:\/\/api\.correoargentino\.com\.ar\/micorreo\/v1\//);
  if(url.endsWith('/token'))return{ok:true,json:async()=>({token:'synthetic'})};
  assert.ok(url.endsWith('/shipping/import'));imports.push(JSON.parse(options.body));return{ok:true,json:async()=>({createdAt:'2026-10-04T07:04:00Z'})};
 });
 assert.equal((await runShipmentJob({admin,provider:correo,allowReal:true})).state,'importado');
 assert.equal((await runShipmentJob({admin,provider:correo,allowReal:true})).processed,false);assert.equal(imports.length,1);assert.equal(imports[0].extOrderId,'MB-'+g.id+'-1');
 q(`update public.pedido set estado='en_preparacion' where id=${lit(g.id)};`);
 await recordVerifiedDispatch({admin,orderId:g.id,tracking:'SYNTHETIC1234',adapter:{mock:false,lookup:async tracking=>({verified:true,orderId:g.id,tracking,state:'accepted'})}});
 q(`update private.order_email_event set state='review' where pedido_id<>${lit(g.id)};`);
 const sent=[];const mail=createResend({enabled:true,apiKey:'synthetic'},async(url,options)=>{
  assert.equal(url,'https://api.resend.com/emails');sent.push({key:options.headers['Idempotency-Key'],payload:JSON.parse(options.body)});return{ok:true,json:async()=>({id:randomUUID()})};
 });
 const worker={admin,adapter:mail,allowReal:true,rolloutAfter:'2000-01-01T00:00:00Z',encryptionKey:'a'.repeat(64),from:'orders@example.test',origin:'https://matebreak.test'};
 while(await deliverDurableOrderEmail(worker)){}
 assert.equal(sent.length,2);assert.equal(new Set(sent.map(s=>s.key)).size,2);
 assert.equal(q(`select count(*) from private.order_email_event where pedido_id=${lit(g.id)} and state='sent';`),'2');
 assert.equal(q(`select count(*) from private.order_email_event where pedido_id=${lit(g.id)} and state='superseded';`),'1');
 assert.equal(q(`select estado from public.pedido where id=${lit(g.id)}`),'enviado');
 assert.ok(sent.some(s=>s.payload.subject.includes('camino')));assert.ok(sent.every(s=>s.payload.html.includes('/src/pages/pedido.html#')));
 console.log('PASS isolated integrated chain: authoritative payment -> paid order -> one MiCorreo parcel import -> correlated dispatch -> two distinct immutable Resend messages; redundant unsent receipt superseded; all transports injected');
 console.log('PASS isolated SQL: service-only/RLS, concurrent dedupe, late approval, refunds, partial refunds, chargeback, stale/conflicting versions, dispatch hold and unchanged stock');
 console.log('PASS isolated email SQL: concurrent claims, immutable encrypted envelope, one capability per event, atomic accepted provider id and no stale claim reuse');
}finally{db.close();}
