import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
import {newCapability,digestCapability,isCapability} from '../server/orders/private-access.mjs';
import {safeCardPresentation} from '../server/payments/card-presentation.mjs';
const orderId='11111111-1111-4111-8111-111111111111';
const origin='https://matebreak.test';
const config={url:'https://example.supabase.co',secret:'test',publishable:'test',origin,production:true};
async function fixture(t,rpc){const {app}=createApp(config,{admin:{rpc},authFactory:()=>({auth:{getUser:async()=>({data:{user:null}})}})});const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));return 'http://127.0.0.1:'+s.address().port;}
test('capabilities have 256 bits, safe format and independent hashed verifiers',()=>{const a=newCapability(),b=newCapability();assert.equal(a.length,43);assert.ok(isCapability(a));assert.notEqual(a,b);assert.match(digestCapability(a),/^[a-f0-9]{64}$/);assert.notEqual(a,digestCapability(a));for(const v of [null,'',orderId,'x'.repeat(42),'<script>'])assert.equal(isCapability(v),false);});
test('private link exchanges once and issues a limited HttpOnly session without exposing credentials',async t=>{
 const link=newCapability(),calls=[];let redeemed=false,sessionHash;
 const base=await fixture(t,async(name,args)=>{calls.push({name,args});if(name==='mb_exchange_order_link'){if(redeemed||args.p_link_hash!==digestCapability(link))return{data:null};redeemed=true;sessionHash=args.p_session_hash;return{data:orderId};}if(name==='mb_read_order_link')return{data:args.p_order_id===orderId&&args.p_session_hash===sessionHash?{id:orderId,total:18500}:null};throw Error('Unexpected RPC');});
 const options={method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({credencial:link})};
 const response=await fetch(base+'/api/seguimiento/intercambiar',options);assert.equal(response.status,200);assert.deepEqual(await response.json(),{pedido:orderId});
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/__Host-mb_order=.*HttpOnly.*Secure.*SameSite=Strict/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.match(response.headers.get('cache-control'),/no-store/);
 assert.ok(!JSON.stringify(calls).includes(link));assert.equal((await fetch(base+'/api/seguimiento/intercambiar',options)).status,404);
 assert.equal((await fetch(base+'/api/seguimiento/'+orderId,{headers:{cookie:cookie.split(';')[0]}})).status,200);
 assert.equal((await fetch(base+'/api/seguimiento/22222222-2222-4222-8222-222222222222',{headers:{cookie:cookie.split(';')[0]}})).status,404);
 assert.equal((await fetch(base+'/api/seguimiento/'+orderId)).status,404);
});
test('invalid/revoked/expired link responses are generic and renewal does not enumerate accounts',async t=>{
 const calls=[];const base=await fixture(t,async(name,args)=>{calls.push({name,args});return{data:null};});
 for(const credencial of ['bad',newCapability()]){const r=await fetch(base+'/api/seguimiento/intercambiar',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({credencial})});assert.equal(r.status,404);assert.deepEqual(await r.json(),{error:'Enlace no disponible o vencido'});}
 for(const email of ['owner@example.test','unknown@example.test']){const r=await fetch(base+'/api/seguimiento/renovar',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({numero:'1001',email})});assert.equal(r.status,202);assert.equal((await r.json()).mensaje,'Si los datos corresponden a una compra, recibirás un enlace privado.');}
 assert.equal(calls.filter(c=>c.name==='mb_exchange_order_link').length,1);
});
test('order capability cannot be substituted with a browser user ID or a bare order UUID',async t=>{
 const calls=[];const base=await fixture(t,async(name,args)=>{calls.push({name,args});return{data:null};});
 assert.equal((await fetch(base+'/api/checkout/pedidos/'+orderId)).status,401);
 assert.equal((await fetch(base+'/api/checkout/pedidos/'+orderId+'?usuario_id=forged',{headers:{cookie:'__Host-mb_cart='+'a'.repeat(64)}})).status,404);
 assert.deepEqual(calls[0].args,{p_pedido_id:orderId,p_token_hash:digestCapability('a'.repeat(64)),p_usuario_id:null});
});
test('card presentation accepts only brand and four digits from a provider response',()=>{
 assert.deepEqual(safeCardPresentation({payment_type_id:'credit_card',payment_method_id:'visa',card:{last_four_digits:'5365',number:'not-retained',security_code:'not-retained'}}),{brand:'visa',last4:'5365'});
 for(const patch of [{payment_method_id:'arbitrary'},{payment_type_id:'account_money'},{card:{last_four_digits:'1234567890123456'}},{card:{last_four_digits:1234}}])assert.equal(safeCardPresentation({payment_type_id:'debit_card',payment_method_id:'master',card:{last_four_digits:'5365'},...patch}),null);
});

test('guest transfer result preserves instructions with the minimized pagos contract',async t=>{
 const expiry='2026-10-04T10:00:00Z';
 const base=await fixture(t,async(name)=>{assert.equal(name,'mb_pedido_por_carrito');return{data:{id:orderId,estado:'pendiente_pago',reserva_hasta:expiry,pagos:[{metodo:'transferencia',estado:'pendiente'}]}};});
 const r=await fetch(base+'/api/checkout/pedidos/'+orderId,{headers:{cookie:'__Host-mb_cart='+'a'.repeat(64)}});
 assert.equal(r.status,200);const data=await r.json();assert.equal(data.reserva_hasta,expiry);assert.ok(data.instructions.message);assert.equal(data.simulacion,null);
});
