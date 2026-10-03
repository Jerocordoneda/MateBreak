import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentState,publicNumber,countdown} from '../src/features/checkout/result-state.mjs';
import {rememberOrder,recentOrderId,readOrder} from '../src/features/orders/recent-order.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('approval requires consistent persisted order and payment, not URL or mock flag',()=>{
 assert.equal(paymentState({estado:'pagado',pagos:[{estado:'aprobado'}]}),'approved');
 for(const estado of ['pagado','pendiente_pago'])assert.equal(paymentState({estado,mock:true,paymentStatus:'approved',pagos:[{estado:'pendiente'}]}),'pending');
 assert.equal(paymentState({estado:'pendiente_pago',pagos:[{estado:'aprobado'}]}),'pending');
 assert.equal(paymentState({estado:'cancelado',pagos:[{estado:'cancelado'}]}),'rejected');
 assert.equal(paymentState({estado:'cancelado',pagos:[]}),'cancelled');
 assert.equal(publicNumber({numero:'1001'}),'1001');assert.equal(publicNumber({id,numero:id.slice(0,8).toUpperCase()}),null);
});
test('countdown ticks 5 to 1 and redirects once; cancellation blocks later callbacks',()=>{
 let callback,cleared=0;const ticks=[],paths=[];
 const create=()=>countdown({tick:n=>ticks.push(n),redirect:p=>paths.push(p),schedule:f=>{callback=f;return 1;},clear:()=>cleared++});
 create();for(let n=0;n<6;n++)callback();assert.deepEqual(ticks,[5,4,3,2,1]);assert.deepEqual(paths,['/']);assert.equal(cleared,1);
 const cancel=create();cancel();callback();assert.equal(paths.length,1);assert.equal(cleared,2);
});
test('navigation storage contains only a validated ID and unavailable storage disables recovery',()=>{
 const values=new Map(),storage={setItem:(k,v)=>values.set(k,v),getItem:k=>values.get(k),removeItem:k=>values.delete(k)};
 assert.equal(rememberOrder(id,storage),true);assert.equal(recentOrderId(storage),id);assert.deepEqual([...values.values()],[id]);
 assert.equal(rememberOrder('secret',storage),false);assert.equal(rememberOrder(id,{setItem:()=>{throw Error();}}),false);
});
test('order read remains GET with same-origin credentials and rejects mismatching server IDs',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let call;
 globalThis.fetch=async(path,options)=>{call={path,options};return{ok:true,json:async()=>({id})};};
 await readOrder(id);assert.equal(call.options.credentials,'same-origin');assert.equal(call.options.cache,'no-store');assert.equal(call.options.body,undefined);assert.match(call.path,/consulta=carrito$/);
 globalThis.fetch=async()=>({ok:true,json:async()=>({id:'other'})});await assert.rejects(()=>readOrder(id));
 globalThis.fetch=async()=>({ok:false});await assert.rejects(()=>readOrder(id));
});
