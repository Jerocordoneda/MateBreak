import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createMockCheckoutStore } from '../server/checkout/mock-store.mjs';

const recipient = { nombre:'Ana',apellido:'Prueba',email:'ana@example.test',telefono:'2494123456',
  codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Pinto',numero:'623' };

for (const result of ['approved','rejected','pending']) test(`guest checkout completes with mock shipping and ${result} payment`,async t=>{
  const databaseCalls=[];
  const cart={id:randomUUID(),items:[{producto_id:'14',variante_id:'30',cantidad:1,nombre:'Mate de prueba'}],
    total:50_000,estado:'abierto',requiere_confirmacion_catalogo:false};
  const quote={items:[{producto_id:'14',variante_id:'30',cantidad:1,nombre:'Mate de prueba',precio_unitario:50_000}],
    subtotal:50_000,moneda:'ARS'};
  const admin={
    rpc:async (name,args)=>{
      databaseCalls.push({name,args});
      if(name==='mb_comercio' && args.p_accion==='carrito') return {data:cart,error:null};
      if(name==='mb_cotizar_catalogo') return {data:quote,error:null};
      throw Error(`El mock no debe ejecutar ${name}`);
    },
    from:table=>{
      databaseCalls.push({table});
      if(table==='producto') return {select:()=>({in:async()=>({data:[{id_producto:14,tipo:'simple',
        catalogo_producto_categoria:[{catalogo_categoria:{slug:'mates'}}]}],error:null})})};
      if(table==='metodo_pago') return {select:()=>({in:async()=>({data:[
        {codigo:'transferencia',nombre:'Transferencia bancaria',activo:false},
        {codigo:'mercadopago',nombre:'Mercado Pago',activo:false}],error:null})})};
      if(table==='metodo_envio') return {select:()=>({in:async()=>({data:[
        {codigo:'retiro',nombre:'Retiro coordinado',activo:false},
        {codigo:'correo_domicilio',nombre:'Correo Argentino a domicilio',activo:false},
        {codigo:'correo_sucursal',nombre:'Correo Argentino a sucursal',activo:false}],error:null})})};
      throw Error(`El mock no debe escribir ni consultar ${table}`);
    },
  };
  const {app}=createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'http://localhost:3000',
    production:false,shippingMode:'mock',paymentsMode:'mock',mockPaymentResult:result,correo:{},mercadoPago:{}},{
    admin,authFactory:()=>({auth:{getUser:async()=>({data:{user:null}})}}),
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const initial=await fetch(base+'/api/carrito');
  assert.equal(initial.status,200);
  const cookie=initial.headers.get('set-cookie').split(';')[0];
  const context=await (await fetch(base+'/api/checkout/contexto',{headers:{cookie}})).json();
  assert.equal(context.modo_prueba,true);
  assert.equal(context.user,null);
  assert.equal(context.payments.find(method=>method.codigo==='mercadopago').activo,true);
  assert.equal(context.deliveries.find(method=>method.codigo==='correo_domicilio').activo,true);

  const headers={cookie,origin:'http://localhost:3000','content-type':'application/json'};
  const shippingResponse=await fetch(base+'/api/checkout/cotizar-envio',{method:'POST',headers,
    body:JSON.stringify({destinatario:recipient,modalidad:'correo_domicilio'})});
  assert.equal(shippingResponse.status,200,await shippingResponse.clone().text());
  const [shipping]=await shippingResponse.json();
  assert.equal(shipping.customerShippingCost,8500);
  assert.equal(shipping.mock,true);

  const idempotencia=randomUUID();
  const checkoutBody={idempotencia,pago:'mercadopago',envio:'correo_domicilio',cotizacion_id:shipping.id,
    destinatario:recipient,total:1,usuario_id:'forged'};
  const invalid=await fetch(base+'/api/checkout/pedidos',{method:'POST',headers,
    body:JSON.stringify({...checkoutBody,cotizacion_id:randomUUID()})});
  assert.equal(invalid.status,409);
  const purchased=await fetch(base+'/api/checkout/pedidos',{method:'POST',headers,body:JSON.stringify(checkoutBody)});
  assert.equal(purchased.status,201,await purchased.clone().text());
  const {order}=await purchased.json();
  assert.equal(order.total,58_500);
  assert.equal(order.mock,true);
  assert.equal('owner' in order,false);
  assert.equal('idempotencia' in order,false);
  assert.match(order.paymentId,/^TEST-/);
  assert.equal(order.estado,{approved:'pagado',rejected:'cancelado',pending:'pendiente_pago'}[result]);
  const replay=await (await fetch(base+'/api/checkout/pedidos',{method:'POST',headers,
    body:JSON.stringify(checkoutBody)})).json();
  assert.equal(replay.order.id,order.id);
  const visible=await (await fetch(base+`/api/checkout/pedidos/${order.id}`,{headers:{cookie}})).json();
  assert.equal(visible.id,order.id);
  assert.equal(visible.paymentId,order.paymentId);
  assert.equal(databaseCalls.some(call=>['mb_checkout_minorista','mb_confirmar_pago'].includes(call.name)),false);
  assert.equal(databaseCalls.some(call=>['pedido','pago','checkout_cotizacion_envio'].includes(call.table)),false);
});

test('simultaneous mock retries create one logical payment', async () => {
  let payments = 0;
  const store = createMockCheckoutStore({ async startPayment() {
    payments++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return { status: 'approved', paymentId: 'TEST-once' };
  } });
  const cart = { id: randomUUID(), items: [{ producto_id: '14', cantidad: 1 }] };
  const quote = { items: [{ producto_id: '14', cantidad: 1 }], subtotal: 50_000, moneda: 'ARS' };
  const input = { owner: 'cart-owner', cart, recipient, mode: 'retiro', quoteId: null, quote, idempotencia: randomUUID() };
  const [first, second] = await Promise.all([store.createOrder(input), store.createOrder(input)]);
  assert.equal(first.id, second.id);
  assert.equal(payments, 1);
});
