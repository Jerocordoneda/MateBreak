// Real migration replay, isolated PostgreSQL only; no Cloud/provider transports.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createWholesaleDatabase,seedWholesale,literal as lit} from './wholesale-local-runtime.mjs';
const db=createWholesaleDatabase(),q=db.query,actor='33333333-3333-4333-8333-333333333333';
const recipient={nombre:'Ana',apellido:'Local',email:'transfer@example.invalid',telefono:'2494123456'};
let serial=30;
try{
 seedWholesale(q);
 const create=(n,method='transferencia',shipping=0)=>{
  const token=(++serial).toString(16).padStart(64,'0');
  const cart=JSON.parse(q(`select public.mb_comercio(${lit(token)},null,'variante',${lit({variante_id:900001,cantidad:n})}::jsonb);`));
  const data={idempotencia:randomUUID(),pago:method,envio:shipping?'correo_domicilio':'retiro',destinatario:shipping?{...recipient,codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Local',numero:'1'}:recipient,total:1,subtotal:1,mates_fisicos:100,descuento_productos:999999};
  if(shipping){data.cotizacion_id=randomUUID();const snapshot={environment:'mock',cartItems:[{variant:'900001',product:'900001',quantity:n,personalization:''}],parcels:[{length:17,width:17,height:17,weight:550*n}]};q(`insert into public.checkout_cotizacion_envio(id,carrito_id,usuario_id,destinatario,modalidad,proveedor,servicio,costo_transportista,valido_hasta,snapshot,fingerprint)values(${lit(data.cotizacion_id)},${lit(cart.id)},null,${lit(data.destinatario)}::jsonb,'correo_domicilio','correo_argentino','LOCAL',${shipping},now()+interval '10 minutes',${lit(snapshot)}::jsonb,public.mb_shipping_fingerprint(${lit(cart.id)},${lit(snapshot)}::jsonb));`);}
  return JSON.parse(q(`select public.mb_checkout_minorista(${lit(token)},null,${lit(data)}::jsonb);`));
 };
 const confirm=(o,ref='BANK-'+o.id)=>`select public.mb_confirmar_transferencia(${lit(actor)},${lit(o.id)},${lit(ref)});`;
 for(const n of [1,2,3])for(const method of ['mercadopago','transferencia']){
  const o=create(n,method),promo=n>=2?n*2000:0,net=n*10000-promo,transfer=method==='transferencia'?net*.1:0;
  assert.equal(o.mates_fisicos,n);assert.equal(o.descuento_promocional,promo);assert.equal(o.descuento_productos,transfer);assert.equal(o.total,net-transfer);
  assert.equal(o.estado,'pendiente_pago');
  assert.equal(q(`select estado from public.pago where pedido_id=${lit(o.id)};`),'pendiente');
  assert.equal(q(`select count(*)from private.order_email_event where pedido_id=${lit(o.id)} and kind='paid';`),'0');
  if(method==='transferencia')assert.ok(Math.abs(Date.parse(o.reserva_hasta)-Date.now()-86400000)<60000);
  q(`select public.mb_cancelar_pedido_servicio(${lit(o.id)});`);
 }
 const shipped=create(2,'transferencia',8500);assert.equal(shipped.total,22900);assert.equal(shipped.costo_envio,8500);q(`select public.mb_cancelar_pedido_servicio(${lit(shipped.id)});`);
 const pending=create(1);
 for(const role of ['anon','authenticated'])assert.throws(()=>q(`set role ${role};${confirm(pending)}`),/permission denied/);
 assert.throws(()=>q(confirm(pending).replace(actor,'44444444-4444-4444-8444-444444444444')),/administracion/);
 const before=q('select stock from public.producto_simple where id_producto=900002;');
 await Promise.all([db.parallel(confirm(pending)),db.parallel(confirm(pending))]);
 assert.equal(q(`select count(*)from private.confirmacion_transferencia where pedido_id=${lit(pending.id)} and actor_id=${lit(actor)} and confirmado_en is not null;`),'1');
 assert.equal(q(`select estado from public.pedido where id=${lit(pending.id)};`),'pagado');
 assert.equal(q(`select count(*)from private.order_email_event where pedido_id=${lit(pending.id)} and kind='paid';`),'1');
 assert.equal(q('select stock from public.producto_simple where id_producto=900002;'),before);
 const expired=create(2);q(`update public.pedido set reserva_hasta=clock_timestamp()-interval '1 second' where id=${lit(expired.id)};`);
 q('select public.mb_expirar_reservas();');const released=q('select stock from public.producto_simple where id_producto=900002;');q('select public.mb_expirar_reservas();');
 assert.equal(q('select stock from public.producto_simple where id_producto=900002;'),released);
 assert.equal(q(`select estado from public.pedido where id=${lit(expired.id)};`),'expirado');
 assert.throws(()=>q(confirm(expired)),/revision manual/);
 const justBefore=create(1);q(`update public.pedido set reserva_hasta=clock_timestamp()+interval '1 minute' where id=${lit(justBefore.id)};`);q(confirm(justBefore));q('select public.mb_expirar_reservas();');
 assert.equal(q(`select estado from public.pedido where id=${lit(justBefore.id)};`),'pagado');
 const race=create(2);q(`update public.pedido set reserva_hasta=clock_timestamp()-interval '1 millisecond' where id=${lit(race.id)};`);
 const results=await Promise.allSettled([db.parallel(confirm(race)),db.parallel('select public.mb_expirar_reservas();')]);
 assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'fulfilled');
 assert.equal(q(`select estado from public.pedido where id=${lit(race.id)};`),'expirado');
 assert.equal(q(`select count(*)from private.confirmacion_transferencia where pedido_id=${lit(race.id)};`),'0');
 assert.equal(q(`select sum(cantidad)from public.movimiento_stock where pedido_id=${lit(race.id)};`),'0');
 console.log('PASS transfer matrix 1/2/3 × MP/transfer; forged totals ignored; shipping intact; 24h; pending/outbox; role denial; concurrent confirmation; paid wins before deadline; expiration wins after deadline; exact release and retries');
}finally{db.close();}
