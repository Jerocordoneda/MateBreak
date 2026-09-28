import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.mjs';
const actor='eeeeeeee-1111-4111-8111-111111111111',target='ffffffff-1111-4111-8111-111111111111';
async function fixture(t,{role='cliente',confirmed=true,session=false}={}){
 const calls=[];
 const admin={auth:{admin:{listUsers:async()=>({data:{users:[{id:target,email:'cliente@example.invalid',email_confirmed_at:'2026-01-01',created_at:'2026-01-01',user_metadata:{role:'administrador'},secret:'never expose'}]}}),getUserById:async()=>({data:{user:{id:target,email_confirmed_at:confirmed?'2026-01-01':null}}})}},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='mb_inventario_autorizado'?role==='administrador':name==='mb_rol'?role:name==='mb_admin_roles'?(args.p_accion==='listar'?{[target]:'cliente'}:{rol:args.p_datos.rol}):[],error:null};}};
 const {app}=createApp({url:'https://example.supabase.co',secret:'test',publishable:'test',origin:'https://matebreak.test',production:true},{admin,authFactory:()=>({auth:{getUser:async()=>({data:{user:{id:actor,user_metadata:{role:'administrador'}}}}),signUp:async(args)=>{calls.push({name:'signup',args});return {data:{session:session?{}:null},error:null};}}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 return {calls,request:(path,method='GET',body)=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method,headers:{origin:'https://matebreak.test','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})};
}
test('registration allowlists display name only and never accepts a role',async t=>{
 const {request,calls}=await fixture(t);const r=await request('/api/auth/registro','POST',{email:' CLIENT@example.invalid ',nombre:' Cliente nuevo ',password:'long-enough-password',rol:'administrador',user_metadata:{role:'vendedor'}});
 assert.equal(r.status,200);assert.equal((await r.json()).sesion_iniciada,false);
 assert.deepEqual(calls,[{name:'signup',args:{email:'client@example.invalid',password:'long-enough-password',options:{data:{nombre:'Cliente nuevo'},emailRedirectTo:'https://matebreak.test/auth/callback'}}}]);
});
test('registration validates name, email and password before Auth',async t=>{
 const {request,calls}=await fixture(t);for(const patch of [{nombre:''},{email:'bad'},{password:'short'}])assert.equal((await request('/api/auth/registro','POST',{nombre:'Cliente',email:'client@example.invalid',password:'long-password',...patch})).status,400);assert.equal(calls.length,0);
});
test('registration supports projects with immediate sessions',async t=>{const {request}=await fixture(t,{session:true});assert.equal((await (await request('/api/auth/registro','POST',{nombre:'Cliente',email:'client@example.invalid',password:'long-password'})).json()).sesion_iniciada,true);});
test('customer and seller cannot list users or change roles despite metadata',async t=>{
 for(const role of ['cliente','vendedor']){const {request,calls}=await fixture(t,{role});assert.equal((await request('/api/admin/usuarios')).status,403);assert.equal((await request('/api/admin/usuarios/'+target+'/rol','PUT',{rol:'administrador',anterior:'cliente'})).status,403);assert.equal(calls.filter(c=>c.name==='mb_admin_roles').length,0);}
});
test('admin list returns only allowed fields and roles from memberships',async t=>{const {request}=await fixture(t,{role:'administrador'});const r=await request('/api/admin/usuarios');assert.equal(r.status,200);assert.deepEqual((await r.json()).usuarios,[{id:target,email:'cliente@example.invalid',nombre:'',confirmado:true,creado_en:'2026-01-01',ultimo_acceso:null,rol:'cliente'}]);assert.equal((await request('/api/admin/usuarios?pagina=-1')).status,400);});
test('commercial dashboard is admin-only and accepts known periods',async t=>{
 const adminFixture=await fixture(t,{role:'administrador'});const response=await adminFixture.request('/api/admin/dashboard?periodo=90_dias');assert.equal(response.status,200);
 assert.deepEqual(adminFixture.calls.find(c=>c.name==='mb_admin_dashboard').args,{p_actor_id:actor,p_periodo:'90_dias'});
 assert.equal((await adminFixture.request('/api/admin/dashboard?periodo=futuro')).status,400);
 const customerFixture=await fixture(t,{role:'cliente'});assert.equal((await customerFixture.request('/api/admin/dashboard')).status,403);assert.equal(customerFixture.calls.some(c=>c.name==='mb_admin_dashboard'),false);
});
test('role changes use verified actor and selected target, not body identity',async t=>{const {request,calls}=await fixture(t,{role:'administrador'});assert.equal((await request('/api/admin/usuarios/'+target+'/rol','PUT',{rol:'vendedor',anterior:'cliente',p_actor_id:'forged',usuario_id:actor})).status,200);assert.deepEqual(calls.find(c=>c.name==='mb_admin_roles').args,{p_actor_id:actor,p_accion:'cambiar',p_datos:{usuario_id:target,rol:'vendedor',anterior:'cliente'}});});
test('unconfirmed email cannot receive team privileges',async t=>{const {request,calls}=await fixture(t,{role:'administrador',confirmed:false});assert.equal((await request('/api/admin/usuarios/'+target+'/rol','PUT',{rol:'administrador',anterior:'cliente'})).status,409);assert.equal(calls.filter(c=>c.name==='mb_admin_roles').length,0);});
