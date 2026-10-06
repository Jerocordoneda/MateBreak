// Isolated synthetic fixtures only. No Cloud client or external transport.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWholesaleDatabase,seedWholesale,literal as lit} from './wholesale-local-runtime.mjs';
import {createMercadoPago} from '../server/payments/mercadopago.mjs';
import {reconcileOnce} from '../server/jobs/reconcile-payments.mjs';
const db=createWholesaleDatabase(),q=db.query;
try{
 seedWholesale(q);
 const token='9'.repeat(64),paymentId='900007',seller='3741487042';
 q(`select public.mb_comercio(${lit(token)},null,'variante','{"variante_id":900001,"cantidad":1}');`);
 const order=JSON.parse(q(`select public.mb_checkout_minorista(${lit(token)},null,${lit({idempotencia:randomUUID(),pago:'mercadopago',envio:'retiro',destinatario:{nombre:'Local',apellido:'Fixture',email:'local@example.test',telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Local',numero:'123'}})}::jsonb);`));
 q(`update public.pedido set reserva_hasta=now()-interval '1 minute' where id=${lit(order.id)};select public.mb_expirar_reservas();`);
 const baseline=()=>q(`select jsonb_build_object('stock',(select stock from public.producto_simple where id_producto=900002),'order',(select estado from public.pedido where id=${lit(order.id)}),'payment',(select estado from public.pago where pedido_id=${lit(order.id)}),'movements',(select jsonb_agg(to_jsonb(m)order by m.id)from public.movimiento_stock m where pedido_id=${lit(order.id)}));`);
 const before=baseline();assert.equal(JSON.parse(before).order,'expirado');
 let observation;
 const admin={rpc:async(name,args={})=>{
  if(name==='mb_reconcile_mp_payment')observation=args.p_observation;
  const raw=q(`set role service_role;select public.${name}(${Object.entries(args).map(([k,v])=>k+'=>'+lit(v)).join(',')});`);
  return {data:raw?JSON.parse(raw):null,error:null};
 }};
 const identityUrl='https://api.mercadolibre.com/users/me';
 const provider=createMercadoPago({enabled:true,accessToken:'APP_USR-synthetic',webhookSecret:'synthetic',origin:'https://stage.example.test',collectorId:seller,expectedLiveMode:true,environment:'test',requireTestIdentity:true,appEnvironment:'staging',production:false},async url=>url===identityUrl?
  {ok:true,status:200,url,redirected:false,headers:new Headers({'content-type':'application/json'}),json:async()=>({id:Number(seller),tags:['test_user']})}:
  {ok:true,json:async()=>({id:Number(paymentId),collector_id:Number(seller),live_mode:true,external_reference:order.id,transaction_amount:Number(order.total),currency_id:'ARS',status:'approved',date_last_updated:'2026-10-06T11:27:26Z'})});
 q(`set role service_role;select public.mb_queue_payment_reconciliation(${lit(paymentId)});`);
 assert.equal(await reconcileOnce({admin,provider,enabled:true}),true);
 assert.equal(q(`select state from private.payment_reconciliation_job where payment_id=${lit(paymentId)}`),'review');
 assert.equal(q(`select attempts from private.payment_reconciliation_job where payment_id=${lit(paymentId)}`),'1');
 assert.equal(q(`select outcome from private.mp_payment_observation where payment_id=${lit(paymentId)}`),'revision_manual');
 assert.equal(q(`select reason from private.order_financial_hold where pedido_id=${lit(order.id)}`),'confirmation_requires_review');
 const sql=`set role service_role;select public.mb_reconcile_mp_payment(${lit(observation)}::jsonb);`;
 const duplicates=await Promise.all([db.parallel(sql),db.parallel(sql)]);
 assert.ok(duplicates.every(x=>JSON.parse(x).outcome==='duplicate'));
 assert.equal(await reconcileOnce({admin,provider,enabled:true}),false);
 assert.equal(baseline(),before);assert.equal(q('select count(*) from private.mp_payment_observation'),'1');
 assert.equal(q('select count(*) from private.order_financial_hold'),'1');
 console.log('PASS fixed TEST seller / true Payment: expired reservation -> review job + financial hold; concurrent duplicates; unchanged order/payment/stock/movements; no synthetic TEST-LOCAL path');
}finally{db.close();}
