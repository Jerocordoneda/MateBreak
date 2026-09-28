import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
test('variant cart accepts only the selected variant, quantity and bounded customization',async t=>{
 const calls=[];const {app}=createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'https://matebreak.test',production:true},{admin:{rpc:async(name,args)=>{calls.push({name,args});return {data:{items:[],total:0}};}},authFactory:()=>({auth:{getUser:async()=>({data:{user:null}})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const request=body=>fetch(`http://127.0.0.1:${server.address().port}/api/carrito/variantes/456`,{method:'PUT',headers:{origin:'https://matebreak.test','content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await request({cantidad:2,personalizacion:'Mate de prueba',precio:1,usuario_id:'forged',producto_id:9})).status,200);
 assert.deepEqual(calls[0].args.p_datos,{variante_id:'456',cantidad:2,personalizacion:'Mate de prueba'});
 assert.equal(calls[0].args.p_usuario_id,null);assert.equal(calls[0].args.p_accion,'variante');
 for(const input of [{cantidad:100},{cantidad:-1},{cantidad:'2'},{cantidad:1,personalizacion:'x'.repeat(1001)}])assert.equal((await request(input)).status,400);
 assert.equal(calls.length,1);
});
