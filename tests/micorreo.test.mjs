import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorreoArgentino,numericPrice,MiCorreoError} from '../server/shipping/correo-argentino.mjs';
import {runShipmentJob} from '../server/shipping/jobs.mjs';
import {shippingSnapshot} from '../server/shipping/snapshot.mjs';
import {createApp} from './helpers/business-app.mjs';
const cfg={username:'fake-api-user',password:'fake-api-secret',customerId:'009fake',originPostalCode:'7000'};
const parcel={weight:500,height:10,width:20,length:30};
const request={destinationPostalCode:'1704',deliveryType:'D',dimensions:parcel};
const future='2030-01-01T00:00:00Z';
const jwt=exp=>'header.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.fake-signature';
function fixture(handler,config=cfg,runtime={}) {
 const calls=[];
 const provider=createCorreoArgentino(config,async(url,options)=>{
  calls.push({url,options});
  return handler(url,options,calls);
 },{sleep:async()=>{},...runtime});
 return {provider,calls};
}
const ok=data=>({ok:true,status:200,json:async()=>data});
const token=()=>ok({token:jwt(2000000000)});
const rates=(price=7755,validTo=future)=>({customerId:cfg.customerId,validTo,rates:[{deliveredType:'D',productType:'CP',productName:'Paq.ar',price}]});
for(const environment of ['test','production'])test('MiCorreo Basic/Bearer and fixed host: '+environment,async()=>{
 const {provider,calls}=fixture(url=>url.endsWith('/token')?token():ok(rates()),{...cfg,environment});
 await provider.quote(request);
 assert.equal(calls[0].options.headers.Authorization,'Basic '+Buffer.from(cfg.username+':'+cfg.password).toString('base64'));
 assert.equal(calls[1].options.headers.Authorization,'Bearer '+jwt(2000000000));
 assert.match(calls[0].url,environment==='test'?/^https:\/\/apitest\./:/^https:\/\/api\./);
 assert.equal(JSON.parse(calls[1].options.body).deliveredType,'D');
 assert.equal(JSON.parse(calls[1].options.body).deliveryType,undefined);
});
test('authentication does not need customerId or origin; 20 requests share one token and cache',async()=>{
 let resolveToken;
 const gate=new Promise(r=>resolveToken=r);
 const {provider,calls}=fixture(async()=>{await gate;return token();},{username:cfg.username,password:cfg.password});
 const requests=Array.from({length:20},()=>provider.authenticate());
 resolveToken();await Promise.all(requests);await provider.authenticate();
 assert.equal(calls.length,1);assert.equal(provider.authReady,true);assert.equal(provider.ratingReady,false);
});
test('JWT cache expires and renews; separate instances never share tokens',async()=>{
 let clock=1000000;
 const {provider,calls}=fixture(()=>ok({token:jwt((clock+120000)/1000)}),cfg,{now:()=>clock});
 await provider.authenticate();await provider.authenticate();assert.equal(calls.length,1);
 clock+=100000;await provider.authenticate();assert.equal(calls.length,2);
 const other=fixture(()=>token()).provider;assert.notEqual(await other.authenticate(),await provider.authenticate());
});
test('JWT without usable exp is not cached',async()=>{
 const {provider,calls}=fixture(()=>ok({token:'opaque-fake-token'}));
 await provider.authenticate();await provider.authenticate();assert.equal(calls.length,2);
});
for(const value of [null,'',false,true,undefined,NaN,Infinity,-1,'abc',' 1 ','0x10','1e3',[],{}])test('rates rejects ambiguous price '+String(value),async()=>{
 const malformed=rates(1);malformed.rates[0].price=value;
 const {provider}=fixture(url=>url.endsWith('/token')?token():ok(malformed));
 const result=await provider.quote(request);
 assert.deepEqual(result,[]);assert.equal(numericPrice(value),null);
});
for(const value of [0,'0',12.5,'12.50'])test('rates accepts explicit finite numeric price '+value,async()=>{
 const {provider}=fixture(url=>url.endsWith('/token')?token():ok(rates(value)));
 assert.equal((await provider.quote(request))[0].carrierCost,Number(value));
});
for(const value of ['bad','2020-01-01T00:00:00Z',null])test('rates rejects invalid expiry '+value,async()=>{
 const {provider}=fixture(url=>url.endsWith('/token')?token():ok(rates(10,value)));
 await assert.rejects(provider.quote(request),e=>e.type==='invalid_response');
});
for(const status of [400,403,404,429,500])test('HTTP sanitized; safe reads limited retry '+status,async()=>{
 const {provider,calls}=fixture(url=>url.endsWith('/token')?token():({ok:false,status,json:async()=>({message:cfg.password})}));
 await assert.rejects(provider.quote(request),e=>!JSON.stringify(e).includes(cfg.password)&&e.status===status);
 assert.equal(calls.filter(c=>c.url.endsWith('/rates')).length,status===429||status===500?3:1);
});
test('rates malformed JSON rejected and transport errors are sanitized',async()=>{
 const {provider}=fixture(url=>url.endsWith('/token')?token():({ok:true,status:200,json:async()=>{throw Error(cfg.password);}}));
 await assert.rejects(provider.quote(request),e=>e.type==='invalid_json'&&!e.message.includes(cfg.password));
});
test('timeout aborts and never exposes credentials',async()=>{
 const {provider}=fixture((url,options)=>url.endsWith('/token')?token():new Promise((resolve,reject)=>{
  options.signal.addEventListener('abort',()=>reject(Error(cfg.password)),{once:true});
 }),{...cfg,timeoutMs:5});
 const keeper=setTimeout(()=>{},100);
 try{await assert.rejects(provider.quote(request),e=>e.type==='transport'&&!JSON.stringify(e).includes(cfg.password));}finally{clearTimeout(keeper);}
});
test('401 safely renews once',async()=>{
 let n=0;const {provider,calls}=fixture(url=>url.endsWith('/token')?token():++n===1?{ok:false,status:401}:ok(rates()));
 await provider.quote(request);assert.equal(calls.filter(c=>c.url.endsWith('/token')).length,2);
});
test('dimensions official boundary and rejection before any network call',async()=>{
 const {provider,calls}=fixture(url=>url.endsWith('/token')?token():ok(rates()));
 await provider.quote({...request,dimensions:{weight:25000,height:150,width:150,length:150}});
 for(const change of [{weight:25001},{height:151},{weight:0},{height:1.5},{length:null}])
  await assert.rejects(provider.quote({...request,dimensions:{...parcel,...change}}));
 assert.equal(calls.length,2);
});
const agency={code:'B0107',name:'Fake agency',status:'ACTIVE',services:{pickupAvailability:true},location:{address:{provinceCode:'B',postalCode:'1842'}}};
test('agencies exclude inactive/no pickup/wrong province/missing CP',async()=>{
 const {provider,calls}=fixture(url=>url.endsWith('/token')?token():ok([agency,{...agency,status:'INACTIVE'},{...agency,services:{}},{...agency,location:{address:{provinceCode:'C',postalCode:'1425'}}},{...agency,location:{address:{provinceCode:'B'}}}]));
 assert.deepEqual(await provider.agencies('B'),[agency]);assert.match(calls[1].url,/services=pickup_availability/);
 await assert.rejects(provider.agencies('I'));
});
const importData={extOrderId:'MB-fake-order-1',orderNumber:'fake-order',recipient:{name:'Fake buyer',email:'fake@example.test'},shipping:{deliveryType:'D',address:{streetName:'Fake',streetNumber:'123',city:'Fake',provinceCode:'B',postalCode:'7000'},...parcel,declaredValue:12000}};
for(const deliveryType of ['D','S'])test('import official shape '+deliveryType+' and createdAt only',async()=>{
 const {provider,calls}=fixture(url=>url.endsWith('/token')?token():ok({createdAt:'2026-09-30 12:00:00',tracking:'not-contract'}));
 const result=await provider.importShipment({...importData,shipping:{...importData.shipping,deliveryType,agency:'B0107'}});
 const sent=JSON.parse(calls[1].options.body);
 assert.equal(sent.shipping.deliveryType,deliveryType);assert.equal(sent.shipping.deliveredType,undefined);
 assert.equal(sent.customerId,cfg.customerId);assert.equal(sent.extOrderId,importData.extOrderId);
 assert.deepEqual(result,{createdAt:'2026-09-30 12:00:00'});assert.equal(calls.length,2);
});
for(const scenario of ['timeout','malformed','duplicate','http500'])test('import does not automatically replay: '+scenario,async()=>{
 const {provider,calls}=fixture(url=>{
  if(url.endsWith('/token'))return token();
  if(scenario==='timeout')throw Error('lost '+cfg.password);
  if(scenario==='malformed')return ok({tracking:'not-contract'});
  return {ok:false,status:scenario==='duplicate'?402:500,json:async()=>({message:'La orden ya fue importada con anterioridad.'})};
 });
 await assert.rejects(provider.importShipment(importData),e=>e.type===(scenario==='duplicate'?'already_imported':'ambiguous')&&!JSON.stringify(e).includes(cfg.password));
 assert.equal(calls.filter(c=>c.url.endsWith('/shipping/import')).length,1);
});
test('validate uses separate ephemeral account password, not Basic credentials',async()=>{
 const {provider,calls}=fixture(url=>url.endsWith('/token')?token():ok({customerId:'validated-id'}),{username:cfg.username,password:cfg.password});
 assert.deepEqual(await provider.validateAccount({email:'fake@example.test',password:'ephemeral-fake'}),{customerId:'validated-id'});
 assert.deepEqual(JSON.parse(calls[1].options.body),{email:'fake@example.test',password:'ephemeral-fake'});
 assert.ok(!JSON.stringify(provider).includes('ephemeral-fake'));
});
function jobFixture(handler) {
 let claimed=false;const saved=[];
 const claim={claimId:'11111111-1111-4111-8111-111111111111',orderId:'fake-order',extOrderId:'MB-fake-order-1',snapshot:{environment:'mock',deliveryType:'D',recipient:importData.recipient,address:importData.shipping.address},parcel:{dimensions:parcel,declaredValue:12000}};
 const admin={rpc:async(name,args)=>name==='mb_claim_shipment'?{data:claimed?null:(claimed=true,claim)}:(saved.push(args),{error:null})};
 return {admin,saved,provider:{mock:true,importShipment:handler},claim};
}
test('job disabled for real provider by default',async()=>{
 await assert.rejects(runShipmentJob({admin:{},provider:{environment:'test',importShipment(){throw Error('no');}}}),/deshabilitada/);
});
for(const type of ['ambiguous','already_imported','http','rate_limit'])test('job sanitizes '+type+' without financial RPCs',async()=>{
 const f=jobFixture(()=>{throw new MiCorreoError(type,'/shipping/import',type==='rate_limit'?429:402);});
 const result=await runShipmentJob(f);assert.equal(result.state,type==='rate_limit'?'error':'revision');
 assert.equal(f.saved.length,1);assert.equal(f.saved[0].p_result.errorType,type);
});
test('job persists createdAt and stops when queue empty',async()=>{
 const f=jobFixture(()=>({createdAt:future}));assert.equal((await runShipmentJob(f)).state,'importado');
 assert.deepEqual(await runShipmentJob(f),{processed:false});
 assert.equal(f.saved[0].p_result.createdAt,future);
});
test('rate_limit without an explicit 429 remains in manual review',async()=>{
 for(const status of [undefined,503]){
  const f=jobFixture(()=>{throw Object.assign(Error('ambiguous'),{type:'rate_limit',status});});
  assert.equal((await runShipmentJob(f)).state,'revision');
 }
});
test('snapshot retains server parcels, variants and canonical province',()=>{
 const result=shippingSnapshot({cart:{items:[{variante_id:'2',producto_id:'1',cantidad:2,personalizacion:'fake'}]},recipient:{nombre:'Fake',apellido:'Buyer',provincia:'Córdoba',codigo_postal:'5000'},deliveryType:'S',pickupPoint:agency,rate:{parcels:[{dimensions:parcel,carrierCost:10}]},environment:'mock'});
 assert.equal(result.address.provinceCode,'X');assert.equal(result.cartItems[0].quantity,2);
 assert.deepEqual(result.parcels[0].dimensions,parcel);
});

// HTTP tests inject providers/DB; they never load .env or use a remote service.
async function httpFixture(t,provider,{localPickup=false}={}) {
 const selection={id:'11111111-1111-4111-8111-111111111111',items:[{producto_id:'1',variante_id:'1',cantidad:1,personalizacion:null}]},seen={};
 const admin={
  rpc:async name=>({data:name==='mb_comercio'?selection:name==='mb_shipping_fingerprint'?'a'.repeat(64):{items:[],subtotal:10000,moneda:'ARS'},error:null}),
  from:table=>table==='producto'?{select:()=>({in:async()=>({data:[{id_producto:'1',tipo:'simple',catalogo_producto_categoria:[{catalogo_categoria:{slug:'mates'}}]}],error:null})})}:
   {insert:row=>{seen.snapshot=row.snapshot;return {select:()=>({single:async()=>({data:{id:'22222222-2222-4222-8222-222222222222'},error:null})})};}},
 };
 const origin=localPickup?'http://localhost:3000':'https://matebreak.test';
 const config=localPickup?{url:'http://127.0.0.1:54321',shippingMode:'mock',paymentsMode:'mock',localPickupMock:true,localPersistMock:true}: {url:'https://example.supabase.co'};
 const {app}=createApp({...config,secret:'fake',publishable:'fake',origin,production:!localPickup},{admin,correo:localPickup?{...provider,mock:true}:provider,mercadoPago:localPickup?{mock:true,ready:true}:{ready:false},authFactory:()=>({auth:{getUser:async()=>({data:{user:{id:'fake-user',email:'fake@example.test'}}})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const call=body=>fetch('http://127.0.0.1:'+server.address().port+'/api/checkout/cotizar-envio',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 return {call,seen};
}
const recipient={nombre:'Fake',apellido:'Buyer',email:'fake@example.test',telefono:'2494123456',codigo_postal:'1704',provincia:'Buenos Aires',ciudad:'Fake',calle:'Fake',numero:'123'};
test('sucursal HTTP revalidates agency and rates its CP instead of residential CP',async t=>{
 let destination;
 const provider={ready:true,environment:'test',agencies:async()=>[agency],quote:async r=>{
  destination=r.destinationPostalCode;assert.equal(r.deliveryType,'S');
  return [{provider:'correo_argentino',service:'CP',name:'Fake service',deliveryType:'S',carrierCost:10,validTo:future}];
 }};
 const {call,seen}=await httpFixture(t,provider,{localPickup:true});
 const response=await call({destinatario:recipient,modalidad:'correo_sucursal',provincia_codigo:'B',punto_codigo:agency.code,weight:999,customerId:'forged'});
 assert.equal(response.status,200,await response.clone().text());assert.equal(destination,'1842');
 assert.equal(seen.snapshot.agency.address.postalCode,'1842');assert.equal(seen.snapshot.parcels[0].dimensions.weight,550);
 assert.equal((await call({destinatario:recipient,modalidad:'correo_sucursal',provincia_codigo:'B',punto_codigo:'BFAKE'})).status,400);
});
test('production cannot enable pickup or consult real agencies',async t=>{
 let calls=0;
 const {call}=await httpFixture(t,{ready:true,agencies:async()=>{calls++;return [agency];}});
 assert.equal((await call({destinatario:recipient,modalidad:'correo_sucursal',provincia_codigo:'B',punto_codigo:agency.code})).status,403);
 assert.equal(calls,0);
 for(const config of [{production:true,url:'http://127.0.0.1:54321'}, {production:false,url:'https://example.supabase.co'}])
  assert.throws(()=>createApp({...config,secret:'fake',publishable:'fake',origin:config.production?'https://localhost:3000':'http://localhost:3000',shippingMode:'mock',paymentsMode:'mock',localPickupMock:true}),/local|mock/i);
});
test('provider secrets never enter HTTP response or internal log',async t=>{
 const logs=[],original=console.warn;console.warn=value=>logs.push(value);t.after(()=>{console.warn=original;});
 const provider={ready:true,quote:async()=>{const e=new MiCorreoError('http','/rates',401);e.message=cfg.password+' Bearer fake-JWT '+cfg.username;throw e;}};
 const {call}=await httpFixture(t,provider);
 const response=await call({destinatario:recipient,modalidad:'correo_domicilio'});
 assert.equal(response.status,503);
 const all=(await response.text())+logs.join('');
 for(const secret of [cfg.password,cfg.username,'fake-JWT','Basic ','Bearer '])assert.ok(!all.includes(secret));
 assert.match(logs.join(''),/"provider":"micorreo"/);assert.match(logs.join(''),/"endpoint":"\/rates"/);
});
test('safe aggregation never mixes different services or accepts expired parcels',async()=>{
 const {quotePackages}=await import('../server/shipping/packaging.mjs');
 let n=0;
 assert.deepEqual(await quotePackages({quote:async()=>[{service:++n===1?'CP':'EP',name:'Fake',carrierCost:10,validTo:future}]},{destinationPostalCode:'1704',deliveryType:'D',packages:[parcel,parcel]}),[]);
 assert.deepEqual(await quotePackages({quote:async()=>[{service:'CP',name:'Fake',carrierCost:10,validTo:'2020-01-01'}]},{destinationPostalCode:'1704',deliveryType:'D',packages:[parcel]}),[]);
});
