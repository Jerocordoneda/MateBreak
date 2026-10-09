import test from 'node:test';
import assert from 'node:assert/strict';
import {renderOrderEmail,paymentPresentation,OFFICIAL_TRACKING_URL} from '../server/email/templates.mjs';
import {createMockMailAdapter,deliverOneOrderEmail} from '../server/email/worker.mjs';
import {createMockTracking,recordVerifiedDispatch} from '../server/shipping/tracking.mjs';
const origin='https://matebreak.test';
const order={id:'11111111-1111-4111-8111-111111111111',numero:'1001',estado:'pagado',subtotal_mercaderia:16000,descuento_productos:0,costo_envio:8500,total:24500,
 items:[{nombre:'Mate <script>no</script>',cantidad:2,precio_original:10000,precio_unitario:8000,opciones:{'BOMBILLA ACERO INOX':'NO'},personalizacion:'Ana & Bruno'}],
 direccion_entrega:{destinatario:{nombre:'Ana',apellido:'Prueba',calle:'Calle sintética',numero:'1',ciudad:'Tandil',provincia:'Buenos Aires',codigo_postal:'7000',email:'not-rendered@example.test',telefono:'not-rendered'}},pagos:[{metodo:'mercadopago',estado:'aprobado',simulado:true}]};
const render=(patch={})=>renderOrderEmail({order,origin,orderUrl:origin+'/src/pages/pedido.html#'+'a'.repeat(43),...patch});
test('received email is branded, responsive, escaped, priced and explicitly mock without card invention',()=>{
 const m=render();assert.match(m.html,/matebreak-logo.png/);assert.match(m.html,/#d8c3a5/);assert.match(m.html,/Geist,Inter,Arial/);assert.match(m.html,/@media\(max-width:600px\)/);assert.match(m.html,/¡Gracias por tu compra!/);assert.match(m.html,/VER MI PEDIDO/);assert.match(m.html,/Foto pendiente/);assert.match(m.html,/Promoción aplicada/);assert.match(m.html,/PAGO SIMULADO/);assert.match(m.html,/Ana &amp; Bruno/);assert.match(m.html,/&lt;script&gt;/);assert.doesNotMatch(m.html,/<script|not-rendered|terminada en|mercadopago-official/);assert.match(m.text,/24.500/);assert.match(m.text,/Calle sintética/);assert.doesNotMatch(m.text,/pagado|pago está confirmado/i);
});
test('photo and payment display use validated data with text fallback and official Mercado Pago asset',()=>{
 const photo=render({order:{...order,items:[{...order.items[0],imagen_url:'https://images.example.test/mate.png'}],pagos:[{metodo:'mercadopago',estado:'aprobado',card_brand:'visa',card_last4:'5365'}]}});assert.match(photo.html,/images.example.test\/mate.png/);assert.match(photo.html,/Visa terminada en 5365/);assert.match(photo.html,/mercadopago-official.png/);
 assert.equal(paymentPresentation({metodo:'transferencia',estado:'pendiente'}),'Transferencia bancaria · Pendiente de confirmación');assert.equal(paymentPresentation({metodo:'mercadopago',estado:'pendiente',card_brand:'unknown',card_last4:'1111222233334444'}),'Mercado Pago · Pendiente de confirmación');
 assert.doesNotMatch(render({order:{...order,items:[{...order.items[0],imagen_url:'javascript:alert(1)'}]}}).html,/javascript:/);
});
test('paid/pending/shipped events cannot misrepresent payment or unverified dispatch',()=>{
 assert.throws(()=>render({kind:'paid',order:{...order,pagos:[{estado:'pendiente'}]}}),/not confirmed/);
 assert.match(render({kind:'pending',order:{...order,pagos:[{metodo:'transferencia',estado:'pendiente'}]}}).html,/Tu pago está pendiente/);
 assert.throws(()=>render({kind:'shipped'}),/verified real dispatch/);
 const shipped=render({kind:'shipped',order:{...order,pagos:[{metodo:'transferencia',estado:'aprobado'}],tracking:{codigo:'SYNTHETIC1234',estado:'in_transit'}}});assert.match(shipped.html,/¡Tu pedido está en camino!/);assert.match(shipped.html,/SEGUIR MI ENVÍO/);assert.ok(shipped.html.includes(OFFICIAL_TRACKING_URL));assert.match(shipped.text,/SYNTHETIC1234/);
 assert.throws(()=>render({origin:'http://localhost:3000'}),/HTTPS/);assert.throws(()=>render({orderUrl:'https://other.test/link'}),/configured origin/);
});
test('mock email adapter deduplicates event keys and never starts an external transport',async()=>{
 const adapter=createMockMailAdapter();await Promise.all([adapter.send({idempotencyKey:'once',message:{html:'first'}}),adapter.send({idempotencyKey:'once',message:{html:'second'}})]);assert.equal(adapter.sent.size,1);assert.equal(adapter.sent.get('once').html,'first');
});
test('email worker stores only token verifiers, acknowledges a durable claim and rejects real adapters',async()=>{
 const calls=[],adapter=createMockMailAdapter();let claimed=false;
 const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='mb_claim_order_email'){if(claimed)return{data:null};claimed=true;return{data:{id:'event1',claim_id:'claim1',kind:'received',order,email:'local@example.test'}};}return{data:null};}};
 assert.equal(await deliverOneOrderEmail({admin,adapter,origin}),true);assert.equal(await deliverOneOrderEmail({admin,adapter,origin}),false);assert.equal(adapter.sent.size,1);
 const verifier=calls.find(c=>c.name==='mb_issue_order_link').args.p_link_hash;assert.match(verifier,/^[a-f0-9]{64}$/);assert.ok(!adapter.sent.get('event1').html.includes(verifier));assert.deepEqual(calls.find(c=>c.name==='mb_finish_order_email').args,{p_claim_id:'claim1',p_outcome:'sent'});
 await assert.rejects(deliverOneOrderEmail({admin,adapter:{mock:false},origin}),/Only the mock/);
});
for(const safeToRetry of [true,false])test('email failure persists '+(safeToRetry?'bounded retry':'manual review')+' without raw provider content',async()=>{
 const calls=[];const admin={rpc:async(name,args)=>{calls.push({name,args});return{data:name==='mb_claim_order_email'?{id:'e',claim_id:'c',kind:'received',order,email:'local@example.test'}:null};}};
 await assert.rejects(deliverOneOrderEmail({admin,origin,adapter:{mock:true,send:async()=>{throw Object.assign(Error('raw-sensitive-provider-content'),{safeToRetry});}}}),error=>!error.message.includes('raw-sensitive-provider-content'));
 assert.equal(calls.at(-1).args.p_outcome,safeToRetry?'retry':'review');
});
test('tracking mock cannot create dispatch; real interface requires authoritative correlated dispatch evidence',async()=>{
 const calls=[];const admin={rpc:async(name,args)=>{calls.push({name,args});return{error:null};}};
 const tracking='SYNTHETIC1234';await assert.rejects(recordVerifiedDispatch({admin,adapter:createMockTracking(),orderId:order.id,tracking}),/Mock tracking/);assert.equal(calls.length,0);
 await assert.rejects(recordVerifiedDispatch({admin,adapter:{lookup:async()=>({verified:true,tracking,orderId:order.id,state:'label_created'})},orderId:order.id,tracking}),/not verified/);
 const result=await recordVerifiedDispatch({admin,adapter:{lookup:async()=>({verified:true,tracking,orderId:order.id,state:'accepted'})},orderId:order.id,tracking});assert.equal(result.url,OFFICIAL_TRACKING_URL);assert.deepEqual(calls[0].args,{p_order_id:order.id,p_tracking:tracking,p_state:'accepted'});
});
