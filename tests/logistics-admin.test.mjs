import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server/app.mjs';
const actor=randomUUID(),order=randomUUID();
const body={action:'safe_retry',actionId:randomUUID(),expectedState:'revision',expectedAttempts:1,expectedClaimId:randomUUID(),confirmed:true,source:'portal',reference:'CASE-LOCAL'};
async function fixture(t,{user={id:actor},role='administrador',error=null}={}){
 const calls=[];
 const {app}=createApp({url:'https://example.supabase.co',secret:'fake',publishable:'fake',origin:'https://matebreak.test',production:true},{
  admin:{rpc:async(name,args)=>{calls.push({name,args});return name==='mb_inventario_autorizado'?{data:role==='administrador'}:name==='mb_rol'?{data:role}:{data:[],error};}},
  authFactory:()=>({auth:{getUser:async()=>({data:{user}})}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 return {calls,request:(route,body,origin='https://matebreak.test')=>fetch(`http://127.0.0.1:${server.address().port}${route}`,body?{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}:{})};
}
const actionRoute=`/api/admin/logistica/${order}/1/acciones`;
test('logistics API and private assets require verified database admin role',async t=>{
 for(const [user,role,status]of [[null,'cliente',401],[{id:actor,user_metadata:{rol:'administrador',admin:true}},'cliente',403],[{id:actor},'vendedor',403]]){
  const f=await fixture(t,{user,role});
  for(const url of ['/api/admin/logistica','/interno/logistica','/interno/logistica/app.js','/interno/logistica/style.css'])assert.equal((await f.request(url)).status,status);
  assert.equal((await f.request(actionRoute,{...body,p_actor_id:actor})).status,status);
  assert.ok(f.calls.every(c=>c.name!=='mb_logistics_admin'));
 }
});
test('logistics private UI is uncached and has restricted CSP',async t=>{
 const f=await fixture(t);
 for(const url of ['/interno/logistica','/interno/logistica/app.js','/interno/logistica/style.css']){
  const r=await f.request(url);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 }
 assert.equal((await f.request('/server/private-ui/logistics.html')).status,404);
});
test('logistics actions use verified actor, allowlist, explicit proof and canonical date',async t=>{
 const f=await fixture(t);
 assert.equal((await f.request(actionRoute,{...body,p_actor_id:randomUUID(),password:'secret',estado_pago:'aprobado',createdAt:'ignored'})).status,200);
 assert.deepEqual(f.calls.at(-1),{name:'mb_logistics_admin',args:{p_actor_id:actor,p_action:'safe_retry',p_data:{orderId:order,parcelNumber:1,actionId:body.actionId,expectedState:body.expectedState,expectedAttempts:1,expectedClaimId:body.expectedClaimId,confirmed:true,source:'portal',reference:'CASE-LOCAL',verification:'absent'}}});
 for(const invalid of [{confirmed:false},{source:'guess'},{reference:'Bearer secret'},{expectedAttempts:-1},{expectedClaimId:'bad'},{expectedState:'importado'},{actionId:'bad'},{action:'verified_import',createdAt:'infinity'}])assert.equal((await f.request(actionRoute,{...body,...invalid})).status,400);
 assert.equal((await f.request(actionRoute,{...body,action:'verified_import',createdAt:'2026-10-01T12:00:00Z'})).status,200);
 assert.equal(f.calls.at(-1).args.p_data.createdAt,'2026-10-01T12:00:00.000Z');
 assert.equal((await f.request(actionRoute,{...body,action:'keep_review'})).status,200);
 assert.equal(f.calls.at(-1).args.p_data.verification,'unresolved');assert.ok(!('source' in f.calls.at(-1).args.p_data));
});
test('logistics rejects cross-origin actions and hides database/provider error details',async t=>{
 const f=await fixture(t,{error:{code:'P0001',message:'SECRET SQL provider body'}});
 assert.equal((await f.request(actionRoute,body,'https://other.test')).status,403);assert.equal(f.calls.length,0);
 const r=await f.request(actionRoute,body);assert.equal(r.status,409);assert.ok(!(await r.text()).includes('SECRET'));
 assert.equal((await f.request('/api/admin/logistica?page=-1')).status,400);
 assert.equal((await f.request(`/api/admin/logistica/${order}/21/historial`)).status,400);
});
