import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWholesaleDatabase,literal as l} from './wholesale-local-runtime.mjs';
const db=createWholesaleDatabase(),q=db.query;
try {
 q(readFileSync(new URL('../deploy/staging/wholesale-commercial.sql',import.meta.url),'utf8'));
 const read=sql=>JSON.parse(q('set role service_role;'+sql));
 const catalog=read('select public.mb_wholesale_catalog(null);');
 assert.equal(catalog.items.length,11);
 for(const item of catalog.items){
  assert.equal(item.eligibleUnits,1);
  for(const qty of [9,10,49,50,99,100]){
   const quote=read(`select public.mb_wholesale_quote(${l([{id:item.id,cantidad:qty}])});`);
   const tier=qty>=100?100:qty>=50?50:10;
   assert.equal(quote.tier,tier);assert.equal(quote.total,qty*item.prices[tier]);
   assert.equal(quote.eligible,qty>=10);
  }
 }
 const mixed=read(`select public.mb_wholesale_quote(${l([{id:'700005',cantidad:25},{id:'700006',cantidad:25}])});`);
 assert.equal(mixed.units,50);assert.equal(mixed.total,350000);
 const owner='a'.repeat(64),key='11111111-1111-4111-8111-111111111111';
 const buyer={nombre:'Prueba local',email:'local@example.invalid',whatsapp:'1100000000',localidad:'Tandil',provincia:'Buenos Aires'};
 const invoke=`select public.mb_wholesale_submit(${l(owner)},${l(key)},${l(buyer)},${l([{id:'700006',cantidad:10,price:1}])},null);`;
 const first=read(invoke);assert.equal(first.quote.total,50000);
 q('update private.wholesale_commercial_offer set price_10=4900 where id=700006;');
 assert.equal(read(invoke).quote.total,50000);
 assert.equal(q('select count(*) from private.wholesale_request;'),'1');
 assert.equal(q('select count(*) from public.pedido;'),'0');assert.equal(q('select count(*) from public.pago;'),'0');
 assert.throws(()=>q('set role anon;select * from private.wholesale_commercial_offer;'));
 assert.throws(()=>q('set role authenticated;select * from private.wholesale_available;'));
 assert.throws(()=>q('set role service_role;update private.wholesale_commercial_offer set price_10=1;'));
 console.log('PASS 11 commercial offers, 66 tier/minimum boundaries, mixed accessories, authoritative price, replay, private ACL, no retail writes');
} finally {db.close();}
