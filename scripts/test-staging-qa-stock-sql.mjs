// SQL behavior tests in the existing owned isolated container, never Cloud.
import assert from 'node:assert/strict';
import {createWholesaleDatabase} from './wholesale-local-runtime.mjs';
import {fixtureSql,protectedQuery,components,project} from './staging-qa-stock.mjs';
const db=createWholesaleDatabase(),q=db.query;
const apply=(baseline,action='apply',env='staging',target=project)=>q(fixtureSql(baseline,action).replace('BEGIN;',`BEGIN; SET LOCAL matebreak.environment='${env}'; SET LOCAL matebreak.qa_stock_project='${target}';`));
const protectedState=()=>JSON.parse(q(protectedQuery));
const stock=()=>q('select jsonb_agg(jsonb_build_array(id_producto,stock) order by id_producto) from public.producto_simple');
try {
 q(`update public.producto_simple set stock=0;
 update public.producto_simple set stock=79 where id_producto in(3,119);
 update public.producto set activo=true where id_producto in(select producto_id from public.catalogo_producto);
 update public.catalogo_producto set publicado=true;
 update public.catalogo_variante set vigente=true,disponible=true;`);
 const empty=protectedState();
 assert.throws(()=>apply(empty),/Approved Staging TEST identity missing/);
 // Synthetic local-only sentinel. This is not evidence of a provider payment.
 q(`insert into public.carrito(id,token_hash)values('77777777-7777-4777-8777-777777777777',repeat('7',64));
 insert into public.pedido(id,carrito_id,idempotencia,estado,moneda,subtotal,costo_envio,direccion_entrega)
 values('61604aac-1393-460e-94a4-fa1cbcbbc6da','77777777-7777-4777-8777-777777777777','88888888-8888-4888-8888-888888888888','pagado','ARS',29300,0,'{}');
 insert into public.pago(pedido_id,metodo,estado,importe,moneda,referencia_externa,simulado)
 values('61604aac-1393-460e-94a4-fa1cbcbbc6da','mercadopago','aprobado',29300,'ARS','181813204213',false);
 insert into private.mp_payment_observation(payment_id,pedido_id,provider_updated_at,digest,provider_status,amount,refunded,environment,collector_id,outcome)
 values('181813204213','61604aac-1393-460e-94a4-fa1cbcbbc6da',now(),repeat('a',64),'approved',29300,0,'test','3741487042','aplicado');`);
 const before=protectedState(),inventory=stock();
 assert.throws(()=>apply(before,'apply','production'),/Staging QA target required/);
 assert.throws(()=>apply(before,'apply','staging','wrong-project'),/Staging QA target required/);
 q("update private.mp_payment_observation set collector_id='999';");
 assert.throws(()=>apply(before),/Approved Staging TEST identity missing/);
 q("update private.mp_payment_observation set collector_id='3741487042',environment='production';");
 assert.throws(()=>apply(before),/Approved Staging TEST identity missing/);
 q("update private.mp_payment_observation set environment='test';");
 q('update public.producto_simple set stock=3 where id_producto=2;');
 assert.throws(()=>apply(before),/Component stock\/mode\/identity changed/);
 assert.equal(q('select stock from public.producto_simple where id_producto=1'),'0');
 assert.equal(q("select count(*) from private.inventario_ajuste where motivo like 'qa-catalog-2026-10-07-v1:%'"),'0');
 q('update public.producto_simple set stock=0 where id_producto=2;');
 await Promise.all([db.parallel(fixtureSql(before).replace('BEGIN;',`BEGIN; SET LOCAL matebreak.environment='staging'; SET LOCAL matebreak.qa_stock_project='${project}';`)),
 db.parallel(fixtureSql(before).replace('BEGIN;',`BEGIN; SET LOCAL matebreak.environment='staging'; SET LOCAL matebreak.qa_stock_project='${project}';`))]);
 assert.equal(q("select count(*) from private.inventario_ajuste where motivo='qa-catalog-2026-10-07-v1:apply'"),'7');
 for(const [id]of components)assert.equal(q(`select stock from public.producto_simple where id_producto=${id}`),'100');
 assert.equal(q('select stock from public.producto_simple where id_producto=3'),'79');
 assert.equal(q('select stock from public.producto_simple where id_producto=119'),'79');
 assert.equal(q('select stock from public.producto_simple where id_producto=11'),'0');
 assert.deepEqual(protectedState(),before);
 assert.equal(q('select count(*) from public.mb_catalogo_disponibilidad() where variante_id<=217 and comprable and con_stock'),'217');
 const once=stock();apply(before);assert.equal(stock(),once);
 // A repeat must not restock consumed QA units; rollback must refuse drift.
 q('update public.producto_simple set stock=99 where id_producto=1;');apply(before);
 assert.equal(q('select stock from public.producto_simple where id_producto=1'),'99');
 assert.throws(()=>apply(before,'rollback'),/Component stock\/mode\/identity changed/);
 q('update public.producto_simple set stock=100 where id_producto=1;');
 apply(before,'rollback');assert.equal(stock(),inventory);assert.deepEqual(protectedState(),before);
 apply(before,'rollback');assert.equal(stock(),inventory);
 assert.throws(()=>apply(before),/Reverted fixture cannot be reapplied/);
 console.log('PASS QA stock: target/TEST guards, atomic failure, 217 availability, concurrent idempotence, no refill, protected history/79 stock, guarded audited rollback');
}finally{db.close();}
