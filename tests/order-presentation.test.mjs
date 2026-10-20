import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryText,simulationKind} from '../src/features/checkout/order-presentation.mjs';
import {persistedSimulation} from '../server/checkout/order-simulation.mjs';
import express from 'express';
import {checkoutRoutes} from '../server/checkout/routes.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('persistent mock provenance matches method and exact order, not a generic mock field',()=>{
 const order={id,pagos:[{metodo:'mercadopago',referencia_externa:'TEST-LOCAL-'+id}]};
 assert.equal(persistedSimulation(order),true);assert.equal(simulationKind(order),'persistente');
 for(const p of [{metodo:'mercadopago',referencia_externa:'TEST-LOCAL-other'},{metodo:'transferencia',referencia_externa:'TEST-LOCAL-'+id},{metodo:'mercadopago',referencia_externa:'123456'}]){
  assert.equal(persistedSimulation({id,pagos:[p]}),false);assert.equal(simulationKind({id,pagos:[p]}),null);
 }
 assert.equal(simulationKind({id,mock:true}),'volatil');assert.equal(simulationKind({id,simulacion:'persistente'}),'persistente');
});
test('nested and legacy addresses render human text without unnecessary contact data',()=>{
 const d={nombre:'STAGING',apellido:'Prueba',calle:'Calle Ficticia',numero:'123',ciudad:'Ciudad',provincia:'Buenos Aires',codigo_postal:'7000',email:'private@example.invalid',telefono:'0000000000',referencia:'private'};
 const nested=deliveryText({destinatario:d,modalidad:'correo_domicilio'});
 assert.equal(nested,'STAGING Prueba · Calle Ficticia 123 · Ciudad · Buenos Aires · 7000');
 assert.equal(deliveryText({destinatario:'Persona',calle:'Calle 1',ciudad:'Ciudad',departamento:'Provincia',pais:'AR'}),'Persona · Calle 1 · Ciudad · Provincia · AR');
 assert.equal(deliveryText({retiro:'Retiro coordinado'}),'Retiro coordinado');assert.equal(deliveryText({}),'A coordinar');
 assert.doesNotMatch(nested,/object Object|private|000000/);
});

test('order read keeps authentication and ownership filtering with additive mock provenance',async t=>{
 const filters=[];let authenticated=true,found=true;
 const query={select(fields){assert.match(fields,/referencia_externa/);return this;},eq(k,v){filters.push([k,v]);return this;},
  async maybeSingle(){return {data:found?{id,estado:'pagado',total:18500,moneda:'ARS',pago:[{metodo:'mercadopago',estado:'aprobado',referencia_externa:'TEST-LOCAL-'+id}]}:null};}};
 const app=express();app.use((req,res,next)=>{req.user=authenticated?{id:'owner-fixture'}:null;next();});
 checkoutRoutes(app,{admin:{from(table){assert.equal(table,'pedido');return query;}},config:{origin:'https://matebreak.test',production:true},correo:{},payment:{},mockCheckout:false});
 app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const url='http://127.0.0.1:'+server.address().port+'/api/checkout/pedidos/'+id;
 const response=await fetch(url);assert.equal(response.status,200);assert.equal((await response.json()).simulacion,'persistente');
 assert.deepEqual(filters,[['id',id],['usuario_id','owner-fixture']]);
 authenticated=false;assert.equal((await fetch(url)).status,401);assert.equal(filters.length,2);
 authenticated=true;found=false;assert.equal((await fetch(url)).status,404);
});
