import test from 'node:test';
import assert from 'node:assert/strict';
import {provinces,province,provinceCode} from '../server/shipping/provinces.mjs';
import {validateRecipient} from '../server/checkout/policy.mjs';
import {checkoutRoutes} from '../server/checkout/routes.mjs';
const recipient={nombre:'Ana',apellido:'Local',email:'local@example.test',telefono:'2494123456',codigo_postal:'7000',provincia:'Buenos Aires',ciudad:'Tandil',calle:'Local',numero:'1'};
test('24 canonical provinces normalize accents, case and Unicode spacing without prototype lookup',()=>{
 assert.equal(provinces.length,24);assert.equal(new Set(provinces.map(p=>p.code)).size,24);
 for(const p of provinces){assert.equal(province(p.name.toUpperCase()).name,p.name);assert.equal(provinceCode(p.name.normalize('NFD')),p.code);}
 for(const v of [' BUENOS\u00a0\u2003 AIRES ','buenos   aires'])assert.equal(province(v).name,'Buenos Aires');
 assert.equal(provinceCode('caba'),'C');assert.equal(provinceCode('CÓRDOBA'),'X');
 for(const v of ['constructor','__proto__','toString','Atlantis','B',null,{},''])assert.throws(()=>province(v));
});
test('quote and checkout validate to exactly the same canonical recipient',()=>{
 assert.deepEqual(validateRecipient({...recipient,provincia:'BUENOS\u00a0 AIRES'}),validateRecipient({...recipient,provincia:'buenos aires'}));
 assert.equal(validateRecipient({...recipient,provincia:' CABA '}).provincia,'Ciudad Autónoma de Buenos Aires');
 assert.throws(()=>validateRecipient({...recipient,provincia:'constructor'}));
});
test('checkout context publishes authoritative catalog and invalid provinces stop before any checkout RPC',async()=>{
 const handlers=new Map(),calls=[];
 const chain={select:()=>chain,in:async()=>({data:[],error:null})};
 checkoutRoutes({get:(p,h)=>handlers.set(p,h),post:(p,h)=>handlers.set(p,h)}, {
  config:{origin:'https://example.test'},hashToken:t=>t,correo:{ready:false},payment:{mock:true},
  admin:{from:()=>chain,rpc:async(n)=>{calls.push(n);return{data:{id:'cart',items:[]}};}}
 });
 let context;await handlers.get('/api/checkout/contexto')({query:{},cartToken:'a'.repeat(64)},{json:v=>context=v});
 assert.deepEqual(context.provinces,provinces);calls.length=0;
 for(const route of ['/api/checkout/pedidos','/api/checkout/cotizar-envio']){
  await assert.rejects(()=>handlers.get(route)({body:{destinatario:{...recipient,provincia:'toString'}}},{}),e=>e.status===400);
 }
 assert.deepEqual(calls,[]);
});
test('checkout route forwards only canonical destinations to the server transaction',async()=>{
 const handlers=new Map(),destinations=[];
 checkoutRoutes({get:(p,h)=>handlers.set(p,h),post:(p,h)=>handlers.set(p,h)}, {
  config:{origin:'https://example.test'},hashToken:t=>t,correo:{},payment:{ready:true},
  admin:{rpc:async(name,args)=>{assert.equal(name,'mb_checkout_minorista');destinations.push(args.p_datos.destinatario);return{data:{id:'11111111-1111-4111-8111-111111111111',estado:'pagado',total:10000}};}}
 });
 for(const provincia of ['Buenos Aires','BUENOS\u00a0\u2003 AIRES','buenos aires']){
  const response={status:()=>response,json:()=>{}};
  await handlers.get('/api/checkout/pedidos')({query:{},headers:{},cartToken:'a'.repeat(64),body:{destinatario:{...recipient,provincia},envio:'retiro',pago:'mercadopago',idempotencia:'22222222-2222-4222-8222-222222222222'}},response);
 }
 assert.equal(destinations.length,3);assert.deepEqual(destinations[0],destinations[1]);assert.deepEqual(destinations[0],destinations[2]);
});
