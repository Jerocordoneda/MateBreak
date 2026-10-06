// Disposable SQL fixtures only; never Cloud or provider transport.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWholesaleDatabase,seedWholesale,literal as lit} from './wholesale-local-runtime.mjs';
import {reconcilePayment} from '../server/payments/reconciliation.mjs';
import {reconcileOnce} from '../server/jobs/reconcile-payments.mjs';
const db=createWholesaleDatabase(),q=db.query;
const rpc=(name,args={})=>q(`set role service_role;select public.${name}(${Object.entries(args).map(([k,v])=>k+'=>'+lit(v)).join(',')});`);
const admin={rpc:async(name,args)=>{const raw=rpc(name,args);return {data:raw?JSON.parse(raw):null,error:null};}};
try{
 seedWholesale(q);
 const token='8'.repeat(64);
 q(`select public.mb_comercio(${lit(token)},null,'variante','{"variante_id":900001,"cantidad":1}');`);
 const order=JSON.parse(q(`select public.mb_checkout_minorista(${lit(token)},null,${lit({idempotencia:randomUUID(),pago:'mercadopago',envio:'retiro',destinatario:{nombre:'Local',apellido:'Fixture',email:'local@example.test',telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Local',numero:'123'}})}::jsonb);`));
 const paymentId='900008';
 const provider={ready:true,collectorId:'456',environment:'test',expectedLiveMode:false,getPayment:async()=>({id:Number(paymentId),external_reference:order.id,collector_id:456,live_mode:false,currency_id:'ARS',transaction_amount:Number(order.total),status:'approved',date_last_updated:new Date().toISOString()})};
 // Freeze the provider version across deliveries and retries.
 const payment=await provider.getPayment();provider.getPayment=async()=>payment;
 rpc('mb_queue_payment_reconciliation',{p_payment_id:paymentId});
 assert.equal(rpc('mb_complete_payment_reconciliation',{p_payment_id:paymentId}),'');
 assert.equal(q('select count(*) from public.pago_webhook_auditoria'),'0');
 assert.equal(q(`select state from private.payment_reconciliation_job where payment_id=${lit(paymentId)}`),'pending');
 await reconcilePayment({admin,provider,paymentId});
 assert.equal(q(`select estado from public.pedido where id=${lit(order.id)}`),'pagado');
 assert.equal(q(`select state from private.payment_reconciliation_job where payment_id=${lit(paymentId)}`),'done');
 assert.equal(q(`select attempts from private.payment_reconciliation_job where payment_id=${lit(paymentId)}`),'0');
 assert.equal(q('select resultado from public.pago_webhook_auditoria'),'aplicado');
 assert.equal(q(`select a.recibido_en=j.created_at from public.pago_webhook_auditoria a join private.payment_reconciliation_job j on j.payment_id=a.pago_externo_id`),'t');
 const baseline=()=>q(`select jsonb_build_object('order',(select to_jsonb(p) from public.pedido p where id=${lit(order.id)}),'payment',(select jsonb_agg(to_jsonb(p)) from public.pago p where pedido_id=${lit(order.id)}),'stock',(select jsonb_agg(to_jsonb(s)order by id_producto)from public.producto_simple s),'movements',(select jsonb_agg(to_jsonb(m)order by id)from public.movimiento_stock m where pedido_id=${lit(order.id)}));`);
 const before=baseline();
 // Audit and completion share a transaction: audit failure cannot hide backlog.
 rpc('mb_queue_payment_reconciliation',{p_payment_id:paymentId});
 q(`create function private.fixture_fail_audit() returns trigger language plpgsql as $$begin raise exception 'Synthetic audit failure';end$$;
 create trigger fixture_fail_audit before insert or update on public.pago_webhook_auditoria for each row execute function private.fixture_fail_audit();`);
 assert.throws(()=>rpc('mb_complete_payment_reconciliation',{p_payment_id:paymentId}),/Synthetic audit failure/);
 assert.equal(q(`select state from private.payment_reconciliation_job where payment_id=${lit(paymentId)}`),'pending');
 assert.equal(baseline(),before);
 q('drop trigger fixture_fail_audit on public.pago_webhook_auditoria;drop function private.fixture_fail_audit();');
 rpc('mb_queue_payment_reconciliation',{p_payment_id:paymentId});
 await Promise.all([reconcilePayment({admin,provider,paymentId}),reconcilePayment({admin,provider,paymentId})]);
 assert.equal(q('select count(*) from public.pago_webhook_auditoria'),'1');assert.equal(baseline(),before);
 // Recovery from the old applied-observation/pending-job state uses the same
 // finalizer, with no fake webhook, fresh purchase, stock operation or INSERT.
 rpc('mb_queue_payment_reconciliation',{p_payment_id:paymentId});
 const complete=`set role service_role;select public.mb_complete_payment_reconciliation(${lit(paymentId)});`;
 await Promise.all([db.parallel(complete),db.parallel(complete)]);
 assert.equal(q('select count(*) from public.pago_webhook_auditoria'),'1');assert.equal(baseline(),before);
 // Normal worker keeps its claim through completion, then finishes it once.
 rpc('mb_queue_payment_reconciliation',{p_payment_id:paymentId});
 assert.equal(await reconcileOnce({admin,provider,enabled:true}),true);
 assert.equal(q(`select state from private.payment_reconciliation_job where payment_id=${lit(paymentId)}`),'done');
 assert.equal(q(`select attempts from private.payment_reconciliation_job where payment_id=${lit(paymentId)}`),'1');
 assert.equal(await reconcileOnce({admin,provider,enabled:true}),false);
 assert.equal(q('select count(*) from public.pago_webhook_auditoria'),'1');assert.equal(baseline(),before);
 assert.equal(q("select has_function_privilege('anon','public.mb_complete_payment_reconciliation(text)','execute') or has_function_privilege('authenticated','public.mb_complete_payment_reconciliation(text)','execute')"),'f');
 console.log('PASS synchronous completion/audit, missing observation fail closed, concurrent duplicate recovery, worker claim ownership, no commercial effects, restricted RPC');
}finally{db.close();}
