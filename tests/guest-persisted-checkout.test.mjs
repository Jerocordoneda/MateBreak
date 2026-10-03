import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp,hashToken} from '../server/app.mjs';
const origin='http://localhost:3000',id='11111111-1111-4111-8111-111111111111',paymentId='22222222-2222-4222-8222-222222222222';
const recipient={nombre:'Ana',apellido:'Local',email:'local@example.test',telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Local',numero:'1'};
for(const status of ['approved','pending','rejected'])for(const authenticated of [false,true])test(`persistent ${authenticated?'authenticated':'guest'} checkout ${status} uses verified ownership, server total and stock lifecycle`,async t=>{
 let order={id,estado:'pendiente_pago',total:10000,moneda:'ARS',reserva_hasta:new Date(Date.now()+60000).toISOString()},calls=[];
 const chain=data=>{const c={select:()=>c,eq:()=>c,single:async()=>({data,error:null})};return c;};
 const admin={from:table=>{if(table==='pago')return chain({id:paymentId,importe:10000,moneda:'ARS'});if(table==='pedido')return chain(order);throw Error('Unexpected table or Auth write');},rpc:async(name,args)=>{calls.push({name,args});if(name==='mb_checkout_minorista')return{data:order};if(name==='mb_mark_mock_payment')return{data:null};if(name==='mb_confirmar_pago'){order={...order,estado:'pagado'};return{data:order};}if(name==='mb_cancelar_pedido_servicio'){order={...order,estado:'cancelado'};return{data:order};}throw Error('Unexpected RPC');}};
 const user=authenticated?{id:'33333333-3333-4333-8333-333333333333'}:null;
 const {app}=createApp({url:'http://127.0.0.1:54321',publishable:'unused',secret:'unused',origin,production:false,localPersistMock:true,shippingMode:'mock',paymentsMode:'mock',mockPaymentResult:status,correo:{},mercadoPago:{}},{admin,authFactory:()=>({auth:{getUser:async()=>({data:{user}})}})});
 const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));const base='http://127.0.0.1:'+s.address().port,token='a'.repeat(64);
 const r=await fetch(base+'/api/checkout/pedidos',{method:'POST',headers:{origin,'content-type':'application/json',cookie:'mb_cart='+token},body:JSON.stringify({idempotencia:'44444444-4444-4444-8444-444444444444',pago:'mercadopago',envio:'retiro',destinatario:recipient,usuario_id:'forged',total:1,descuento:99999})});
 assert.equal(r.status,201,await r.clone().text());const data=await r.json();assert.equal(data.order.total,10000);assert.equal(data.mock,true);assert.equal(data.order.estado,{approved:'pagado',pending:'pendiente_pago',rejected:'cancelado'}[status]);
 assert.equal(calls[0].args.p_usuario_id,user?.id||null);assert.equal(calls[0].args.p_token_hash,hashToken(token));assert.equal('total' in calls[0].args.p_datos,false);assert.equal('usuario_id' in calls[0].args.p_datos,false);assert.equal(calls[1].name,'mb_mark_mock_payment');
 assert.deepEqual(calls.map(c=>c.name),['mb_checkout_minorista','mb_mark_mock_payment',...(status==='approved'?['mb_confirmar_pago']:status==='rejected'?['mb_cancelar_pedido_servicio']:[])]);
});
