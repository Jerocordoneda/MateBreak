// Local synthetic browser fixture. No Supabase, providers, proxy or credentials.
import express from 'express';
import {resolve} from 'node:path';
import {quoteCart} from '../server/checkout/cart-quote.mjs';
import {shippingProgress,calculateTotals} from '../server/checkout/policy.mjs';
const app=express();app.use(express.json({verify:(req,res,buffer)=>{req.fixtureBody=buffer.toString('utf8');}}));let quantity=1;
const id='11111111-1111-4111-8111-111111111111';
const raw=()=>({id:'browser-fixture',estado:'abierto',moneda:'ARS',total:quantity*10000,items:[{producto_id:'13',variante_id:'2',nombre:'STAGING Mate sintético',opciones:{'BOMBILLA ACERO INOX':'NO'},cantidad:quantity,precio:10000,subtotal:quantity*10000,activo:true}]});
const quote=()=>({moneda:'ARS',subtotal:quantity*(quantity>=2?8000:10000),items:[{producto_id:13,variante_id:2,nombre:'STAGING Mate sintético',opciones:{'BOMBILLA ACERO INOX':'NO'},cantidad:quantity,precio_unitario:quantity>=2?8000:10000}]});
const order=legacy=>({id,estado:'pagado',moneda:'ARS',total:18500,subtotal:10000,costo_envio:8500,creado_en:'2026-10-02T21:00:00Z',
 items:[{nombre:'STAGING Mate sintético',cantidad:1,subtotal:10000}],pagos:[{metodo:'mercadopago',estado:'aprobado',referencia_externa:'TEST-LOCAL-'+id}],
 direccion_entrega:legacy?{destinatario:'STAGING Legacy',calle:'Calle Ficticia 123',ciudad:'Ciudad Ficticia',departamento:'Buenos Aires',codigo_postal:'7000'}:{destinatario:{nombre:'STAGING',apellido:'Prueba',calle:'Calle Ficticia',numero:'123',ciudad:'Ciudad Ficticia',provincia:'Buenos Aires',codigo_postal:'7000',email:'private@example.invalid',telefono:'0000000000'}},envio:{estado:'pendiente'}});
app.get('/api/carrito',async(req,res)=>res.json(await quoteCart(raw(),{rpc:async()=>({data:quote()})})));
app.put('/api/carrito/variantes/2',async(req,res)=>{if(!Number.isInteger(req.body.cantidad)||req.body.cantidad<1||req.body.cantidad>99)return res.sendStatus(400);quantity=req.body.cantidad;res.json(await quoteCart(raw(),{rpc:async()=>({data:quote()})}));});
app.get('/api/carrito/resumen',(req,res)=>res.json({cantidad:quantity}));
app.get('/api/sesion',(req,res)=>res.json({usuario:{id,email:'fixture@example.invalid',rol:'cliente'}}));
app.get('/api/perfil',(req,res)=>res.json({nombre:'STAGING Prueba',telefono:''}));
app.get(['/api/emails','/api/direcciones','/api/productos'],(req,res)=>res.json([]));
app.get('/api/pedidos',(req,res)=>res.json([order(false),{...order(true),id:'44444444-4444-4444-8444-444444444444',pagos:[{metodo:'transferencia',estado:'aprobado'}]}]));
app.get('/api/metodos',(req,res)=>res.json({pagos:[],envios:[]}));
app.get('/api/checkout/pedidos/:id',(req,res)=>res.json({...order(false),simulacion:'persistente'}));
app.get('/api/checkout/contexto',(req,res)=>res.json({user:{email:'fixture@example.invalid'},requiresAuthentication:true,cart:raw(),quote:quote(),progress:shippingProgress(quote().subtotal),modo_prueba:true,mock_persistente:true,deliveries:[{codigo:'correo_domicilio',nombre:'Envío simulado a domicilio',activo:true}],payments:[{codigo:'mercadopago',nombre:'Mock',activo:true}],pickupEnabled:false}));
app.post('/api/checkout/cotizar-envio',(req,res)=>res.json([{id:'22222222-2222-4222-8222-222222222222',customerShippingCost:calculateTotals({merchandiseSubtotal:quote().subtotal,carrierCost:8500,method:'mercadopago'}).customerShippingCost,mock:true}]));
let replayRequests=0,firstBody=null;
app.post('/api/checkout/pedidos',(req,res)=>{
 if(req.body.idempotencia!=='22222222-2222-4222-8222-222222222222'||req.headers.cookie!=='local_replay=synthetic')return res.sendStatus(405);
 replayRequests++;if(!firstBody)firstBody=req.fixtureBody;
 if(req.fixtureBody!==firstBody)return res.sendStatus(409);
 res.status(replayRequests===1?201:200).json({mock:true,paymentStatus:'approved',order:{id,estado:'pagado',total:18500,moneda:'ARS'}});
});
app.get('/audit/state',(req,res)=>res.json({requests:replayRequests,orders:firstBody?1:0}));
app.get('/audit/replay.js',(req,res)=>res.sendFile('tools/staging-idempotency-replay.js',{root:resolve('.')}));
app.get('/audit/replay',(req,res)=>{
 res.setHeader('Set-Cookie','local_replay=synthetic; HttpOnly; SameSite=Strict; Path=/');
 res.type('html').send(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Replay aislado</title><h1>Componentes de idempotencia · sólo loopback</h1>
 <button id="first">Enviar fixture aprobado local</button><button id="audit">Auditar primera respuesta</button><button id="replay">Replay único</button><button id="release">Liberar respuesta</button><p id="status" role="status"></p>
 <script src="/audit/replay.js"></script><script>
 const body=JSON.stringify({idempotencia:'22222222-2222-4222-8222-222222222222',cotizacion_id:'33333333-3333-4333-8333-333333333333',pago:'mercadopago',envio:'correo_domicilio',directa:false,destinatario:{email:'fixture@example.invalid'}});
 const status=document.querySelector('#status');document.querySelector('#first').onclick=async event=>{event.target.disabled=true;try{await fetch('/api/checkout/pedidos',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body});status.textContent+=' · Respuesta original liberada';}catch{status.textContent='Error de fixture; detener';}};
 document.querySelector('#audit').onclick=async()=>{const state=await(await fetch('/audit/state')).json();if(state.requests!==1||state.orders!==1)throw Error('Audit failed');const proof=mbStagingReplay.inspect();mbStagingReplay.confirmAudit(proof.orderId);status.textContent='Primera respuesta auditada: 1 request, 1 pedido simulado local';};
 document.querySelector('#replay').onclick=async event=>{event.target.disabled=true;try{await mbStagingReplay.replayOnce();const state=await(await fetch('/audit/state')).json();status.textContent='Replay auditado: '+state.requests+' requests, '+state.orders+' pedido, misma sesión y cuerpo literal';}catch{status.textContent='Replay falló; sin reintentos';}};
 document.querySelector('#release').onclick=()=>mbStagingReplay.release();</script></html>`);
});
// Ordinary orders/Auth writes are refused; only the fixed /audit/replay fixture is accepted above.
app.use('/api',(req,res)=>res.status(405).json({error:'Escritura fuera del alcance de la vista local'}));
const root=resolve('dist');
for(const [route,page] of Object.entries({'/carrito':'tienda','/checkout':'checkout','/mi-cuenta':'cuenta','/checkout/resultado':'checkout-resultado'}))app.get(route,(req,res)=>res.sendFile('src/pages/'+page+'.html',{root}));
app.use(express.static(root));
app.listen(4178,'127.0.0.1',()=>console.log('Local-only UX preview: http://127.0.0.1:4178/carrito · /checkout · /mi-cuenta · /checkout/resultado?pedido='+id));
