import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createGuestDatabase,seedGuestFixture,sqlLiteral as lit} from './guest-local-runtime.mjs';
const db=createGuestDatabase(),q=db.query;
try{
 seedGuestFixture(q);
 q(`insert into public.catalogo_variante(id,producto_id,external_id,precio,opciones,disponible) overriding system value values(900010,900001,'local-two-mates',30000,'{}',true),(900011,900001,'local-no-mate',1500,'{}',true);
 insert into public.catalogo_variante_mapeo(variante_id,aprobado)values(900010,true),(900011,true);
 insert into public.catalogo_variante_componente(variante_id,producto_simple_id,cantidad,evidencia)values(900010,900002,2,'Synthetic two-mate set'),(900011,900003,1,'Synthetic accessory');`);
 const token='d'.repeat(64),set=(variant,qty)=>JSON.parse(q(`select public.mb_comercio(${lit(token)},null,'variante',${lit({variante_id:variant,cantidad:qty})}::jsonb);`));
 const check=cart=>JSON.parse(q(`select public.mb_cotizar_catalogo(${lit(cart.id)},'mercadopago');`));
 for(const n of [1,2,3,4,5]){
  const cart=set(900001,n),quote=check(cart);assert.equal(quote.mates_fisicos,n);assert.equal(quote.subtotal_original_productos,n*10000);assert.equal(quote.descuento_promocional,n>=3?n*2000:0);assert.equal(quote.subtotal,n>=3?n*8000:n*10000);
 }
 set(900001,1);set(900010,1);const cart=set(900011,1),quote=check(cart);
 assert.equal(quote.mates_fisicos,3);assert.equal(quote.subtotal_original_productos,41500);assert.equal(quote.descuento_promocional,8300);assert.equal(quote.subtotal,33200);
 const box=q("select producto_id from private.inventario_ficha where sku='MB-CAJA-MATE';");
 assert.equal(q('select cantidad from public.catalogo_variante_componente where variante_id=900010 and producto_simple_id='+box),'2');
 assert.equal(q('select count(*)from public.catalogo_variante_componente where variante_id=900011 and producto_simple_id='+box),'0');
 const recipient={nombre:'Ana',apellido:'Local',email:'checkout@example.invalid',telefono:'2494123456'};
 const body={idempotencia:randomUUID(),pago:'transferencia',envio:'retiro',destinatario:recipient,total:1,descuento_promocional:999999};
 const checkout=()=>JSON.parse(q(`select public.mb_checkout_minorista(${lit(token)},null,${lit(body)}::jsonb);`));
 const order=checkout();assert.equal(order.total,29880);assert.equal(order.subtotal_mercaderia,33200);assert.equal(order.descuento_productos,3320);assert.equal(order.descuento_promocional,8300);assert.equal(order.mates_fisicos,3);assert.equal(checkout().id,order.id);
 assert.equal(q('select stock from public.producto_simple where id_producto=900002'),'97');assert.equal(q('select stock from public.producto_simple where id_producto='+box),'97');assert.equal(q('select stock from public.producto_simple where id_producto=900003'),'99');
 assert.equal(q('select count(*)from public.pedido'),'1');assert.equal(q('select count(*)from public.movimiento_stock where pedido_id='+lit(order.id)+" and motivo='reserva'"),'3');
 assert.equal(JSON.parse(q('select public.mb_claim_order_email();')).email,recipient.email);
 assert.equal(q("select has_function_privilege('anon','public.mb_cotizar_catalogo(uuid,text)','execute')"),'f');
 console.log('PASS SQL physical mates 1/2/3/4/5; mixed two-mate set + variant + non-mate; 20% then 10%=28%; forged browser discount ignored; exact 3 mates/3 boxes/1 accessory; idempotent order; checkout email outbox; anonymous pricing RPC denied');
}finally{db.close();}
