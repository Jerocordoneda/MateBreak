// Called only by the guarded local Auth suite. All users/orders are synthetic.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mustSql} from './local-test-runtime.mjs';
import {createMockShipping} from '../server/shipping/mock.mjs';
import {runShipmentJob} from '../server/shipping/jobs.mjs';

export async function testCommerceRC({admin,a,b,actorId,variant,recipient,checked,newRequests}) {
 let request=a.request,otherRequest=b.request;
 const setId=JSON.parse(await mustSql(`select to_jsonb(cv.id) from public.catalogo_variante cv
  join public.producto p on p.id_producto=cv.producto_id
  where p.tipo='combo' and cv.precio>0 and exists(select 1 from public.catalogo_producto_categoria pc
   join public.catalogo_categoria c on c.id=pc.categoria_id where pc.producto_id=p.id_producto and c.slug like 'set-%')
  and exists(select 1 from public.catalogo_variante_componente c where c.variante_id=cv.id) order by cv.id limit 1;`));
 assert.ok(setId,'Missing synthetic set catalog');
 // Stock belongs exclusively to the disposable local test DB.
 await mustSql(`update public.producto_simple set stock=100 where id_producto in
  (select producto_simple_id from public.catalogo_variante_componente where variante_id in (${BigInt(variant.id)},${BigInt(setId)}));`);
 const makeOrder=async(id,quantity,delivery='correo_domicilio')=>{
  const fresh=await newRequests();request=fresh.a;otherRequest=fresh.b;
  assert.equal((await request('/carrito')).status,200);
  const cart=await request('/carrito/variantes/'+id,'PUT',{cantidad:quantity});assert.equal(cart.status,200,JSON.stringify(cart.data));
  const pickup=delivery==='correo_sucursal'?{provincia_codigo:'B',punto_codigo:'MOCKB01'}:{};
  const quote=await request('/checkout/cotizar-envio','POST',{destinatario:recipient,modalidad:delivery,...pickup});
  assert.equal(quote.status,200,JSON.stringify(quote.data));
  const body={idempotencia:randomUUID(),pago:'mercadopago',envio:delivery,cotizacion_id:quote.data[0].id,destinatario:recipient};
  const result=await request('/checkout/pedidos','POST',body);assert.equal(result.status,201,JSON.stringify(result.data));
  assert.equal(result.data.order.estado,'pagado');
  assert.equal((await request('/checkout/pedidos','POST',body)).data.order.id,result.data.order.id);
  return {order:result.data.order,quote:quote.data[0]};
 };
 const cases=[['1 mate',variant.id,1,[{length:17,width:17,height:17,weight:550}]],
  ['2 mates',variant.id,2,[{length:34,width:17,height:17,weight:1100}]],
  ['1 set',setId,1,[{length:30,width:30,height:20,weight:1300}]],
  ['2 sets',setId,2,[{length:30,width:30,height:20,weight:2600}]],
  ['3 sets',setId,3,[{length:30,width:30,height:20,weight:2600},{length:30,width:30,height:20,weight:1300}]]];
 for(const [name,id,quantity,dimensions]of cases){
  const {order,quote}=await makeOrder(id,quantity);
  assert.equal(quote.packageCount,dimensions.length);
  const shipment=await checked(admin.from('envio').select('snapshot').eq('pedido_id',order.id).single());
  assert.deepEqual(shipment.snapshot.parcels.map(p=>p.dimensions),dimensions);
  assert.equal(shipment.snapshot.cartItems[0].variant,String(id));assert.equal(shipment.snapshot.cartItems[0].quantity,quantity);
  const before=await checked(admin.from('pago').select('estado,importe').eq('pedido_id',order.id).single());
  const refs=[],provider=createMockShipping(),importMock=provider.importShipment;
  provider.importShipment=async payload=>{refs.push(payload.extOrderId);assert.deepEqual(payload.shipping.deliveryType,'D');return importMock(payload);};
  const results=await Promise.all(dimensions.map(()=>runShipmentJob({admin,provider})));
  // Financial reconciliation serializes claims on the parent order. A worker
  // may find no claim while that row is locked; the next bounded invocation
  // can take an untouched pending parcel. Never retry an ambiguous import.
  assert.ok(results.some(j=>j.processed));
  for(let n=0;n<dimensions.length&&refs.length<dimensions.length;n++)
    assert.equal((await runShipmentJob({admin,provider})).processed,true);
  assert.equal(refs.length,dimensions.length);
  assert.equal(new Set(refs).size,dimensions.length);
  for(let i=1;i<=dimensions.length;i++)assert.ok(refs.includes(`MB-${order.id}-${i}`));
  assert.deepEqual(await runShipmentJob({admin,provider}),{processed:false});
  assert.equal((await checked(admin.from('envio').select('estado_integracion').eq('pedido_id',order.id).single())).estado_integracion,'importado');
  assert.deepEqual(await checked(admin.from('pago').select('estado,importe').eq('pedido_id',order.id).single()),before);
  console.log(`PASS full commercial packing: ${name}, ${dimensions.length} parcel(s), persisted snapshot -> paid order -> concurrent mock import`);
 }
 const agencies=await request('/checkout/sucursales?provincia=B');assert.equal(agencies.status,200);assert.equal(agencies.data[0].code,'MOCKB01');
 assert.match(agencies.data[0].name,/ficticia/);
 await mustSql("update public.metodo_envio set activo=true where codigo='correo_sucursal';");
 const {order:pickupOrder}=await makeOrder(variant.id,1,'correo_sucursal');
 const pickup=await checked(admin.from('envio').select('snapshot').eq('pedido_id',pickupOrder.id).single());
 assert.equal(pickup.snapshot.deliveryType,'S');assert.equal(pickup.snapshot.agency.code,'MOCKB01');assert.equal(pickup.snapshot.agency.address.postalCode,'7001');
 let pickupCalls=0;
 const provider=createMockShipping();provider.importShipment=async data=>{pickupCalls++;assert.equal(data.shipping.agency,'MOCKB01');assert.equal(data.shipping.deliveryType,'S');return {createdAt:new Date().toISOString()};};
 await runShipmentJob({admin,provider});assert.equal(pickupCalls,1);
 console.log('PASS exclusively local/mock pickup: fictitious agency -> quote snapshot -> paid order -> mock import');

 assert.equal((await request('/admin/logistica')).status,403);
 await mustSql(`insert into private.equipo_inventario(usuario_id) values ('${actorId}');`);
 assert.equal((await otherRequest('/admin/logistica')).status,403);
 assert.equal((await request('/admin/logistica?state=all')).status,200);
 const {order}=await makeOrder(variant.id,1);
 const ambiguous=createMockShipping();let importCalls=0;
 ambiguous.importShipment=async()=>{importCalls++;throw Object.assign(Error('SECRET RAW PROVIDER BODY'),{type:'ambiguous',status:503});};
 assert.equal((await runShipmentJob({admin,provider:ambiguous})).state,'revision');
 assert.deepEqual(await runShipmentJob({admin,provider:ambiguous}),{processed:false});assert.equal(importCalls,1);
 const route=`/admin/logistica/${order.id}/1/acciones`;
 const row=async()=>{const response=await request('/admin/logistica?state=all');assert.equal(response.status,200);assert.ok(!JSON.stringify(response.data).includes('SECRET'));return response.data.find(r=>r.orderId===order.id);};
 const action=async(type,extra={})=>{const state=await row();return {action:type,actionId:randomUUID(),expectedState:state.state,
  expectedAttempts:state.attempts,expectedClaimId:state.claimId,...extra};};
 const financial=await checked(admin.from('pedido').select('estado,total,cotizacion_envio_id').eq('id',order.id).single());
 const stocks=await checked(admin.from('producto_simple').select('id_producto,stock').order('id_producto'));
 const review=await action('keep_review');assert.equal((await otherRequest(route,'POST',{...review,p_actor_id:actorId})).status,403);
 assert.equal((await request(route,'POST',review)).status,200);
 assert.equal((await request(route,'POST',await action('safe_retry'))).status,400);
 const retry=await action('safe_retry',{confirmed:true,source:'portal',reference:'LOCAL-ABSENT-1'});
 const retryResponses=await Promise.all([request(route,'POST',retry),request(route,'POST',retry)]);
 assert.deepEqual(retryResponses.map(r=>r.status),[200,200]);
 const ref=(await row()).extOrderId;
 ambiguous.importShipment=async data=>{importCalls++;assert.equal(data.extOrderId,ref);throw Object.assign(Error('ambiguous'),{type:'ambiguous'});};
 await runShipmentJob({admin,provider:ambiguous});assert.equal(importCalls,2);assert.equal((await row()).attempts,2);
 assert.equal((await request(route,'POST',retry)).status,200,'Idempotent retry must not reopen a subsequent attempt');
 assert.equal((await row()).state,'revision');
 const verified=await action('verified_import',{confirmed:true,source:'support',reference:'LOCAL-EXISTS-2',createdAt:'2026-10-01T12:00:00Z'});
 assert.equal((await request(route,'POST',{...verified,createdAt:'infinity'})).status,400);
 assert.equal((await request(route,'POST',verified)).status,200);
 assert.equal((await request(route,'POST',verified)).status,200);
 assert.equal((await request(route,'POST',{...review,actionId:randomUUID()})).status,409);
 assert.equal((await request(route,'POST',{...verified,createdAt:'2026-10-02T12:00:00Z'})).status,409,'Incompatible actionId reuse');
 assert.deepEqual(await runShipmentJob({admin,provider:ambiguous}),{processed:false});assert.equal(importCalls,2);
 const history=await request(`/admin/logistica/${order.id}/1/historial`);assert.equal(history.status,200);assert.equal(history.data.length,3);
 assert.ok(history.data.every(h=>h.actorId===actorId));
 assert.deepEqual(await checked(admin.from('pedido').select('estado,total,cotizacion_envio_id').eq('id',order.id).single()),financial);
 assert.deepEqual(await checked(admin.from('producto_simple').select('id_producto,stock').order('id_producto')),stocks);
 console.log('PASS admin HTTP recovery: DB role, spoof denial, ambiguous quarantine, official absence proof, same external ID, concurrent idempotency, verified import, stale/conflicting actions, immutable financial state');
}
