import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createApp, hashToken } from '../server/app.mjs';
import { shippingProgress, calculateTotals, validateRecipient } from '../server/checkout/policy.mjs';
import { createCorreoArgentino } from '../server/shipping/correo-argentino.mjs';
import { createMercadoPago, verifyMercadoPagoSignature } from '../server/payments/mercadopago.mjs';

const recipient = { nombre:'Ana', apellido:'Pérez', email:'ana@example.test', telefono:'2494123456',
  codigo_postal:'7000', provincia:'Buenos Aires', ciudad:'Tandil', calle:'Pinto', numero:'623' };
const requestHeaders = { origin:'https://matebreak.test', 'content-type':'application/json' };

test('free shipping uses pre-payment merchandise subtotal at and above ARS 80,000', () => {
  assert.equal(shippingProgress(79_999.99).eligible, false);
  assert.equal(shippingProgress(80_000).eligible, true);
  assert.equal(shippingProgress(80_000.01).eligible, true);
  assert.equal(shippingProgress(55_000).remaining, 25_000);
  assert.deepEqual(calculateTotals({merchandiseSubtotal:85_000,carrierCost:7755,method:'transferencia'}), {
    merchandiseSubtotal:85_000,discount:8500,carrierCost:7755,customerShippingCost:0,total:76_500,currency:'ARS',
  });
  assert.equal(calculateTotals({merchandiseSubtotal:79_999,carrierCost:7755,method:'transferencia'}).customerShippingCost,7755);
});

test('recipient fields are validated and browser-only amounts are discarded', () => {
  assert.equal(validateRecipient({...recipient,total:-1,shipping_cost:0}).calle,'Pinto');
  assert.throws(()=>validateRecipient({...recipient,email:'bad'}));
  assert.throws(()=>validateRecipient({...recipient,telefono:'12'}));
  assert.throws(()=>validateRecipient({...recipient,numero:'<script>'}));
});

test('MiCorreo adapter sends documented postal and measured parcel fields', async () => {
  const calls=[];
  const fakeFetch=async (url, options) => {
    calls.push({url,options});
    return {ok:true,json:async()=>url.endsWith('/token')?{token:'test-token'}:{validTo:'2030-01-01T00:00:00Z',rates:[{deliveredType:'D',productType:'CP',productName:'Paq.ar Clásico',price:7755}]}};
  };
  const provider=createCorreoArgentino({username:'u',password:'p',customerId:'customer',originPostalCode:'7000'},fakeFetch);
  const quotes=await provider.quote({destinationPostalCode:'1704',deliveryType:'D',dimensions:{weight:500,height:10,width:20,length:30}});
  assert.equal(quotes[0].carrierCost,7755);
  assert.deepEqual(JSON.parse(calls[1].options.body),{customerId:'customer',postalCodeOrigin:'7000',postalCodeDestination:'1704',deliveredType:'D',dimensions:{weight:500,height:10,width:20,length:30}});
  await assert.rejects(provider.quote({destinationPostalCode:'1704',deliveryType:'D',dimensions:{weight:0,height:10,width:20,length:30}}));
  assert.equal(createCorreoArgentino({}).ready,false);
});

test('MiCorreo lists pickup agencies using the documented response shape', async () => {
  const provider=createCorreoArgentino({username:'u',password:'p',customerId:'customer',originPostalCode:'7000'},async url=>({
    ok:true,json:async()=>url.endsWith('/token')?{token:'test-token'}:[
      {code:'B0107',name:'Monte Grande',status:'ACTIVE',services:{pickupAvailability:true},location:{address:{city:'Monte Grande',provinceCode:'B',postalCode:'1842'}}},
      {code:'B0108',name:'Sin retiro',services:{pickupAvailability:false}},
    ],
  }));
  assert.deepEqual((await provider.agencies('B')).map(agency=>agency.code),['B0107']);
});

test('Mercado Pago requires explicit enablement and signs webhook with the official manifest', async () => {
  assert.equal(createMercadoPago({accessToken:'token',webhookSecret:'secret',origin:'https://matebreak.test'}).ready,false);
  assert.throws(()=>createMercadoPago({enabled:true,accessToken:'token',origin:'http://localhost:3000'}));
  const now=Date.now(),ts=String(Math.floor(now/1000)),requestId='req-1',dataId='12345',secret='secret';
  const v1=createHmac('sha256',secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  assert.equal(verifyMercadoPagoSignature({signature:`ts=${ts},v1=${v1}`,requestId,dataId,secret,now}),true);
  assert.equal(verifyMercadoPagoSignature({signature:`ts=${ts},v1=${v1}`,requestId,dataId:'99999',secret,now}),false);
  assert.equal(verifyMercadoPagoSignature({signature:`ts=${ts},v1=${v1}`,requestId,dataId,secret,now:now+11*60_000}),false);
});

test('catalog and cart are separate pages, and product cards open product details', () => {
  const cart=readFileSync(new URL('../src/pages/tienda.html',import.meta.url),'utf8');
  const catalog=readFileSync(new URL('../src/features/catalog/catalog-ui.js',import.meta.url),'utf8');
  assert.doesNotMatch(cart, /id="catalogo"|id="productos"/);
  assert.match(catalog, /link\.href='\/productos\/'/);
  assert.match(catalog, /title\.href=link\.href/);
  assert.match(cart, /id="checkout-button"/);
});

test('Comprar ahora uses a separate HttpOnly cart credential and preserves ordinary cart', async t => {
  const calls=[];
  const {app}=createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'https://matebreak.test',production:true},{
    admin:{rpc:async(name,args)=>{calls.push({name,args});return {data:{items:[{cantidad:2}],total:200,requiere_confirmacion_catalogo:false},error:null};}},
    authFactory:()=>({auth:{getUser:async()=>({data:{user:null}})}}),
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const ordinary=await fetch(base+'/api/carrito');const normalCookie=ordinary.headers.get('set-cookie').split(';')[0];
  const response=await fetch(base+'/api/compra-directa',{method:'POST',headers:{...requestHeaders,cookie:normalCookie},body:JSON.stringify({variante_id:'456',cantidad:2,personalizacion:'Ana',total:-1})});
  assert.equal(response.status,201);
  const directCookie=response.headers.get('set-cookie');assert.match(directCookie,/__Host-mb_direct=/);assert.match(directCookie,/HttpOnly/);
  const normalToken=normalCookie.split('=')[1],directToken=directCookie.match(/mb_direct=([a-f0-9]+)/)[1];
  assert.notEqual(hashToken(normalToken),hashToken(directToken));
  assert.equal(calls.at(-1).args.p_token_hash,hashToken(directToken));
  assert.deepEqual(calls.at(-1).args.p_datos,{variante_id:'456',cantidad:2,personalizacion:'Ana'});
  assert.equal((await response.json()).next,'/carrito?directa=1');
  const both=`${normalCookie}; __Host-mb_direct=${directToken}`;
  await fetch(base+'/api/carrito?directa=1',{headers:{cookie:both}});
  assert.equal(calls.filter(call=>call.name==='mb_comercio').at(-1).args.p_token_hash,hashToken(directToken));
  await fetch(base+'/api/carrito/variantes/456?directa=1',{method:'PUT',headers:{...requestHeaders,cookie:both},body:JSON.stringify({cantidad:1})});
  assert.equal(calls.filter(call=>call.name==='mb_comercio').at(-1).args.p_token_hash,hashToken(directToken));
  await fetch(base+'/api/carrito',{headers:{cookie:`${normalCookie}; __Host-mb_direct=${directToken}`}});
  assert.equal(calls.filter(call=>call.name==='mb_comercio').at(-1).args.p_token_hash,hashToken(normalToken));
});

for(const scenario of ['success','lost-response'])test('online preference uses persisted total and conserves reservation: '+scenario, async t => {
  const orderId='11111111-1111-4111-8111-111111111111',cartToken='a'.repeat(64),seen=[];
  const {app}=createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'https://matebreak.test',production:true},{
    admin:{rpc:async(name,args)=>{seen.push({name,args});return {data:{id:orderId,estado:'pendiente_pago',total:90_000,reserva_hasta:new Date(Date.now()+60*60_000).toISOString()},error:null};},
      from:table=>table==='pedido_item'?{select:()=>({eq:async()=>({data:[{producto_id:'123',variante_id:'456',nombre:'Mate',cantidad:1}],error:null})})}
        :{insert:async()=>({error:null}),update:()=>({eq:()=>({eq:async()=>({error:null})})})}},
    mercadoPago:{ready:true,createPreference:async data=>{seen.push({preference:data});if(scenario==='lost-response')throw Error('timeout');return {id:'mp-pref',redirectUrl:'https://www.mercadopago.com.ar/checkout/test'};}},
    authFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'verified-user',email:'ana@example.test'}}})}}),
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/checkout/pedidos`,{
    method:'POST',headers:{...requestHeaders,cookie:`__Host-mb_cart=${cartToken}`},body:JSON.stringify({
      idempotencia:'22222222-2222-4222-8222-222222222222',pago:'mercadopago',envio:'retiro',destinatario:recipient,total:1,usuario_id:'forged',
    }),
  });
  assert.equal(response.status,scenario==='success'?201:503,JSON.stringify({body:await response.clone().json(),seen}));
  assert.equal(seen.filter(c=>c.name==='mb_cancelar_pedido_servicio').length,0);
  assert.equal(seen.find(entry=>entry.preference).preference.total,90_000);
  assert.equal(seen.find(entry=>entry.preference).preference.items[0].producto_id,'123');
  assert.equal(seen.find(entry=>entry.name==='mb_checkout_minorista').args.p_usuario_id,'verified-user');
  assert.equal(seen.find(entry=>entry.name==='mb_checkout_minorista').args.p_datos.total,undefined);
});

for (const estado of ['pagado','cancelado','expirado']) test(`retry of ${estado} order never starts another real payment`, async t => {
  const orderId='11111111-1111-4111-8111-111111111111', seen=[];
  const {app}=createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'https://matebreak.test',production:true},{
    admin:{rpc:async name=>{seen.push(name);return {data:{id:orderId,estado,total:90_000},error:null};},
      from:table=>{throw Error(`No DB payment attempt for ${table}`);}},
    mercadoPago:{ready:true,createPreference:async()=>{throw Error('No second preference');}},
    authFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'verified-user',email:'ana@example.test'}}})}}),
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/checkout/pedidos`,{
    method:'POST',headers:{...requestHeaders,cookie:`__Host-mb_cart=${'a'.repeat(64)}`},
    body:JSON.stringify({idempotencia:'22222222-2222-4222-8222-222222222222',pago:'mercadopago',
      envio:'retiro',destinatario:recipient}),
  });
  assert.equal(response.status,200,await response.clone().text());
  const body=await response.json();
  assert.equal(body.order.id,orderId);
  assert.equal(body.redirectUrl,undefined);
  assert.deepEqual(seen,['mb_checkout_minorista']);
});

test('expired pending reservation cannot start a real payment preference', async t => {
  const {app}=createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'https://matebreak.test',production:true},{
    admin:{rpc:async()=>({data:{id:'11111111-1111-4111-8111-111111111111',estado:'pendiente_pago',
      reserva_hasta:new Date(Date.now()-1000).toISOString()},error:null}),
    from:table=>{throw Error(`No DB payment attempt for ${table}`);}},
    mercadoPago:{ready:true,createPreference:async()=>{throw Error('No expired preference');}},
    authFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'verified-user',email:'ana@example.test'}}})}}),
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/checkout/pedidos`,{
    method:'POST',headers:{...requestHeaders,cookie:`__Host-mb_cart=${'a'.repeat(64)}`},
    body:JSON.stringify({idempotencia:'22222222-2222-4222-8222-222222222222',pago:'mercadopago',
      envio:'retiro',destinatario:recipient}),
  });
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/reserva venció/i);
});
