// Owned disposable PostgreSQL only: no ports, Supabase client or remote targets.
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createGuestDatabase,seedGuestFixture,sqlLiteral as lit} from './guest-local-runtime.mjs';
import assert from 'node:assert/strict';
const db=createGuestDatabase(),q=db.query;
try{
 q(readFileSync(new URL('../supabase/tests/guest-checkout.sql',import.meta.url),'utf8'));
 assert.equal(q('select count(*) from public.pedido'),'0');assert.equal(q('select count(*) from auth.users'),'0');
 console.log('PASS SQL transaction rolled back; no orders or Auth users remain');seedGuestFixture(q);
 q(readFileSync(new URL('../supabase/tests/guest-commerce-regression.sql',import.meta.url),'utf8'));console.log('PASS guest pricing/stock/legacy regression transaction rolled back');
 assert.throws(()=>q("begin;set local role anon;select public.mb_exchange_order_link(repeat('a',64),repeat('b',64));rollback;"),/permission denied/);
 assert.throws(()=>q("begin;set local role authenticated;select * from private.order_access;rollback;"),/permission denied/);
 const token='9'.repeat(64),recipient={nombre:'Ana',apellido:'Local',email:'ana@example.test',telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Prueba',numero:'123'};
 q(`select public.mb_comercio('${token}',null,'variante','{"variante_id":900001,"cantidad":1}');`);
 const body={idempotencia:randomUUID(),pago:'mercadopago',envio:'retiro',destinatario:recipient};
 q(`begin;set local role service_role;select public.mb_comercio(repeat('6',64),null,'variante','{"variante_id":900001,"cantidad":1}');select public.mb_checkout_minorista(repeat('6',64),null,${lit({...body,idempotencia:randomUUID()})}::jsonb);rollback;`);
 console.log('PASS real service_role execution; anon/authenticated private RPC/table access denied');
 const sql=`begin;select public.mb_checkout_minorista('${token}',null,${lit(body)}::jsonb)->>'id';select pg_sleep(0.1);commit;`;
 const [a,b]=await Promise.all([db.parallel(sql),db.parallel(sql)]);assert.equal(a.trim(),b.trim());
 assert.equal(q('select count(*) from public.pedido'),'1');assert.equal(q('select stock from public.producto_simple where id_producto=900002'),'99');
 assert.equal(q("select count(*) from public.movimiento_stock where motivo='reserva'"),'2');
 const claims=await Promise.all([db.parallel('select public.mb_claim_order_email();'),db.parallel('select public.mb_claim_order_email();')]);assert.equal(claims.filter(Boolean).length,1);
 console.log('PASS concurrent identical checkout: one order, one reservation per component; one durable email claim');
 for(const t of ['7','8'])q(`select public.mb_comercio(repeat('${t}',64),null,'variante','{"variante_id":900001,"cantidad":99}');`);
 const races=await Promise.allSettled(['7','8'].map(t=>db.parallel(`select public.mb_checkout_minorista(repeat('${t}',64),null,${lit({...body,idempotencia:randomUUID()})}::jsonb);`)));
 assert.equal(races.filter(v=>v.status==='fulfilled').length,1);assert.equal(q('select stock from public.producto_simple where id_producto=900002'),'0');
 assert.equal(q('select count(*) from auth.users'),'0');console.log('PASS concurrent competing carts cannot oversell; no synthetic Auth user');
}finally{db.close();}
