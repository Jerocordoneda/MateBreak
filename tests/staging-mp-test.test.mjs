import test from 'node:test';import assert from 'node:assert/strict';
import {loadConfig} from '../server/config/environment.mjs';
import {resolveProviderModes,createProviders} from '../server/providers.mjs';
import {assertStagingConfig,persistedMock,PROTECTED_PRODUCTION_REF} from '../server/config/staging.mjs';
import {createApp} from './helpers/business-app.mjs';
const ref='abcdefghijklmnopqrst',env={APP_ENV:'staging',NODE_ENV:'development',APP_ORIGIN:'https://stage.example.test',
 SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_STAGING_PROJECT_REF:ref,SUPABASE_PUBLISHABLE_KEY:'synthetic',SUPABASE_SECRET_KEY:'synthetic',
 SHIPPING_MODE:'mock',PAYMENTS_MODE:'real',MATEBREAK_STAGING_MP_TEST:'1',MATEBREAK_STAGING_PERSIST_MOCK:'0',
 MP_ENVIRONMENT:'test',MP_EXPECTED_LIVE_MODE:'false',MP_COLLECTOR_ID:'3741487042',MP_ACCESS_TOKEN:'TEST-synthetic-only',MERCADOPAGO_WEBHOOK_SECRET:'synthetic-only'};
test('Staging real transport with mock shipping requires every explicit TEST guard before any network',()=>{
 const {config}=loadConfig(env);assertStagingConfig(config);assert.equal(persistedMock(config),false);
 const p=createProviders(config);assert.equal(p.shipping.mock,true);assert.equal(p.payment.mock,false);assert.equal(p.webhook.ready,true);assert.equal(p.webhook.expectedLiveMode,false);
 for(const patch of [{APP_ENV:'local'},{APP_ENV:'production'},{NODE_ENV:'production'},{MATEBREAK_STAGING_MP_TEST:'0'},
 {MATEBREAK_STAGING_PERSIST_MOCK:'1'},{MATEBREAK_LOCAL_PERSIST_MOCK:'1'},{MATEBREAK_LOCAL_PICKUP_MOCK:'1'},
 {MP_ACCESS_TOKEN:''},{MERCADOPAGO_WEBHOOK_SECRET:''},{MP_COLLECTOR_ID:''},{MP_COLLECTOR_ID:'invalid'},
 {MP_EXPECTED_LIVE_MODE:'true'},{MP_EXPECTED_LIVE_MODE:''},{MP_EXPECTED_LIVE_MODE:'FALSE'},{MP_ENVIRONMENT:'production'},{MP_ENVIRONMENT:''},
 {SUPABASE_STAGING_PROJECT_REF:PROTECTED_PRODUCTION_REF,SUPABASE_URL:`https://${PROTECTED_PRODUCTION_REF}.supabase.co`},
 {APP_ORIGIN:'http://stage.example.test'},{CORREO_MICORREO_PASSWORD:'synthetic'},{RESEND_API_KEY:'synthetic'},{EMAILS_ENABLED:'1'},
 {MP_UNKNOWN_CREDENTIAL:'synthetic'},{DATABASE_URL:'synthetic'},{MERCADOPAGO_ACCESS_TOKEN:'TEST-different-synthetic'}]) assert.throws(()=>loadConfig({...env,...patch}));
});
test('all shipping/payment combinations retain production prohibition and explicit mock circuit',()=>{
 for(const production of [false,true])for(const shippingMode of ['mock','real'])for(const paymentsMode of ['mock','real']){
  const e={...env,NODE_ENV:production?'production':'development',SHIPPING_MODE:shippingMode,PAYMENTS_MODE:paymentsMode};
  const denied=production&&(shippingMode==='mock'||paymentsMode==='mock');
  if(denied)assert.throws(()=>resolveProviderModes(e));else assert.deepEqual(resolveProviderModes(e),{shippingMode,paymentsMode});
 }
 const mock={...env,PAYMENTS_MODE:'mock',MATEBREAK_STAGING_MP_TEST:'0',MATEBREAK_STAGING_PERSIST_MOCK:'1',MP_ACCESS_TOKEN:'',MERCADOPAGO_WEBHOOK_SECRET:'',MP_COLLECTOR_ID:'',MP_ENVIRONMENT:'',MP_EXPECTED_LIVE_MODE:''};
 const {config}=loadConfig(mock);assert.equal(persistedMock(config),true);assert.equal(createProviders(config).payment.mock,true);
 assert.equal(persistedMock({...config,paymentsMode:'real'}),false);
});
test('TEST provider injection cannot bypass environment or seller contract',()=>{
 const {config}=loadConfig(env);
 for(const patch of [{environment:'production'},{expectedLiveMode:true},{collectorId:'999'}])assert.throws(()=>createProviders(config,{mercadoPago:{ready:true,environment:'test',expectedLiveMode:false,collectorId:'3741487042',verifyTestIdentity:async()=>({sellerId:'3741487042',testUser:true}),...patch}}),/contract mismatch/);
});
test('TEST checkout creates preference and never marks, confirms or returns TEST-LOCAL',async t=>{
 const {config}=loadConfig(env),calls=[],id='11111111-1111-4111-8111-111111111111';
 const order={id,estado:'pendiente_pago',total:10000,moneda:'ARS',reserva_hasta:new Date(Date.now()+60000).toISOString()};
 const admin={rpc:async name=>{calls.push(name);return {data:order};},from:table=>{
  calls.push(table);
  if(table==='mercadopago_intento')return {insert:async()=>({}),update:()=>({eq:()=>({eq:async()=>({})})})};
  if(table==='pedido_item')return {select:()=>({eq:async()=>({data:[{producto_id:1,cantidad:1}]})})};
  throw Error('Unexpected TEST DB path');
 }};
 const mp={ready:true,environment:'test',collectorId:'3741487042',expectedLiveMode:false,verifyTestIdentity:async()=>({sellerId:'3741487042',testUser:true}),createPreference:async value=>{assert.equal(value.total,10000);calls.push('preference');return {id:'synthetic-preference',redirectUrl:'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=synthetic'};}};
 const {app}=createApp(config,{admin,mercadoPago:mp,authFactory:()=>({auth:{getUser:async()=>({data:{user:null}})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const r=await fetch(`http://127.0.0.1:${server.address().port}/api/checkout/pedidos`,{method:'POST',headers:{origin:config.origin,'content-type':'application/json'},body:JSON.stringify({idempotencia:'22222222-2222-4222-8222-222222222222',pago:'mercadopago',envio:'retiro',destinatario:{nombre:'Fixture',apellido:'Synthetic',email:'fixture@example.invalid',telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Fixture',calle:'Fixture',numero:'1'}})});
 assert.equal(r.status,201,await r.clone().text());const body=await r.json();assert.equal(body.order.estado,'pendiente_pago');assert.match(body.redirectUrl,/^https:\/\/www\.mercadopago\.com\.ar\//);assert.equal(body.mock,undefined);
 assert.ok(calls.includes('preference'));assert.ok(!calls.some(n=>/mb_mark_mock_payment|mb_confirmar_pago/.test(n)));
});
