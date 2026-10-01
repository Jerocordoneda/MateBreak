import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
async function setup(t,quantity=6) {
 const selection={id:'11111111-1111-4111-8111-111111111111',items:[{producto_id:'2',cantidad:quantity}]};
 const counters={quote:0,persist:0};
 const admin={rpc:async name=>({data:name==='mb_comercio'?selection:{items:selection.items,subtotal:80000,moneda:'ARS'},error:null}),from:table=>{
  if(table==='producto')return {select:()=>({in:async()=>({data:[{id_producto:2,tipo:'combo',catalogo_producto_categoria:[{catalogo_categoria:{slug:'set-materos'}}]}],error:null})})};
  if(table==='metodo_pago'||table==='metodo_envio')return {select:()=>({in:async()=>({data:table==='metodo_pago'?[{codigo:'mercadopago',activo:true}]:[{codigo:'retiro',activo:true},{codigo:'correo_domicilio',activo:true}],error:null})})};
  counters.persist++;throw Error('No persistence allowed for a manual request');
 }};
 const {app}=createApp({url:'http://127.0.0.1:54321',secret:'test',publishable:'test',origin:'http://localhost:3000',shippingMode:'mock',paymentsMode:'mock'},
 {admin,correo:{mock:true,ready:true,quote:async()=>{counters.quote++;throw Error('No fabricated parcel should be rated');}},authFactory:()=>({auth:{getUser:async()=>({data:{user:null},error:null})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 return {base:`http://127.0.0.1:${server.address().port}`,counters};
}
const recipient={nombre:'Ana',apellido:'Pérez',email:'ana@example.test',telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Pinto',numero:'623'};
test('large checkout exposes manual handoff, retains pickup and does not rate or persist invented parcels',async t=>{
 const {base,counters}=await setup(t);const context=await(await fetch(base+'/api/checkout/contexto')).json();
 assert.equal(context.manualQuoteAvailable,true);assert.equal(context.packaging.status,'manual');assert.equal(context.deliveries.find(d=>d.codigo==='retiro').activo,true);
 const response=await fetch(base+'/api/checkout/cotizar-envio',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({destinatario:recipient,modalidad:'correo_domicilio'})});
 assert.equal(response.status,202);assert.equal((await response.json()).status,'manual_quote_required');assert.deepEqual(counters,{quote:0,persist:0});
 const handoff=await fetch(base+'/api/checkout/cotizacion-manual',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify({destinatario:recipient,total:1,items:[]})});
 assert.equal(handoff.status,200);const request=await handoff.json();assert.equal(request.items[0].cantidad,6);assert.equal(request.subtotal,80000);assert.match(handoff.headers.get('cache-control'),/no-store/);assert.deepEqual(counters,{quote:0,persist:0});
});
test('public HTTP entry points and legacy module URLs work without exposing repository secrets',async t=>{
 const {base}=await setup(t);
 for(const route of ['/','/tienda','/carrito','/checkout','/checkout/resultado','/productos/mate','/mi-cuenta','/healthz','/src/js/account.js','/src/features/account/ui.mjs'])assert.equal((await fetch(base+route)).status,200,route);
 for(const route of ['/.env','/.env.example','/server/app.mjs','/package.json','/src/../.env'])assert.equal((await fetch(base+route)).status,404,route);
});
