import test from 'node:test';
import assert from 'node:assert/strict';
import {retailAdminRoutes} from '../server/payments/retail-admin.mjs';
const id='a'.repeat(8)+'-aaaa-4aaa-8aaa-'+'a'.repeat(12);
function fixture(role='administrador',signed=true){
 const handlers={},calls=[],headers={};
 const app={get:(p,f)=>handlers.get=f,post:(p,f)=>handlers.post=f};
 const admin={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='mb_rol'?role:[],error:null};}};
 retailAdminRoutes(app,{admin,requireUser:req=>{if(!req.user)throw Object.assign(Error('login'),{status:401});return req.user.id;},uuid:v=>v===id});
 return {handlers,calls,req:{user:signed?{id}:null,params:{id},query:{},body:{action:'prepare',actionId:id,expectedState:'pagado',p_actor_id:'forged'}},res:{set:v=>Object.assign(headers,v),json:v=>v},headers};
}
test('retail API rejects anonymous and seller operations',async()=>{
 for(const [role,signed,status] of [['administrador',false,401],['vendedor',true,403]]){
  const f=fixture(role,signed);await assert.rejects(f.handlers.post(f.req,f.res),e=>e.status===status);assert.equal(f.calls.some(c=>c.name==='mb_retail_order_admin'),false);
 }
});
test('retail API binds actor to session and accepts only the reviewed action fields',async()=>{
 const f=fixture();await f.handlers.post(f.req,f.res);const call=f.calls.find(c=>c.name==='mb_retail_order_admin');
 assert.deepEqual(call.args,{p_actor_id:id,p_action:'prepare',p_data:{orderId:id,actionId:id,expectedState:'pagado'}});assert.equal(f.headers['Cache-Control'],'private, no-store');
});
test('retail API refuses arbitrary dispatch, approval and invalid pagination',async()=>{
 for(const action of ['dispatch','approve','refund']){const f=fixture();f.req.body.action=action;await assert.rejects(f.handlers.post(f.req,f.res),e=>e.status===400);}
 const f=fixture();f.req.query.pagina='1.5';await assert.rejects(f.handlers.get(f.req,f.res),e=>e.status===400);
});
