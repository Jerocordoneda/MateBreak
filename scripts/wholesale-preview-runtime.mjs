// Loopback Express + disposable PostgreSQL. Auth provider fixture, never Cloud.
import {createApp} from '../server/app.mjs';
import {createWholesaleDatabase,seedWholesale,literal as l} from './wholesale-local-runtime.mjs';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
export async function startWholesalePreview({commercial=false}={}){
 const db=createWholesaleDatabase();seedWholesale(db.query);
 if(commercial){db.query('update private.wholesale_offer set active=false;');db.query(readFileSync(new URL('../deploy/staging/wholesale-commercial.sql',import.meta.url),'utf8'));}
 const users=new Map(),sessions=new Map(),confirmations=new Map();let lastConfirmation;
 const alice={id:'11111111-1111-4111-8111-111111111111',email:'alice@example.invalid',user_metadata:{nombre:'Ana Pérez'}},bob={id:'22222222-2222-4222-8222-222222222222',email:'bob@example.invalid',user_metadata:{nombre:'Bruno Local'}};
 for(const user of [alice,bob]){users.set(user.email,user);db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)values('+l(user.id)+','+l(user.email)+',now(),'+l(user.user_metadata)+');');}
 db.query("insert into public.perfil(id,nombre,telefono)values('"+alice.id+"','Ana Pérez','1100000000'),('"+bob.id+"','Bruno Local','1122222222');"+
 "insert into public.direccion(id,usuario_id,destinatario,telefono,calle,ciudad,departamento,pais)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','"+alice.id+"','Ana Pérez','1133333333','Fixture 1','Tandil','Buenos Aires','AR'),('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2','"+alice.id+"','Ana Pérez','1144444444','Fixture 2','Córdoba','Córdoba','AR'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1','"+bob.id+"','Bruno Local','1155555555','Otra 1','Salta','Salta','AR');");
 const signatures={mb_rol:['p_usuario_id'],mb_inventario_autorizado:['p_usuario_id'],mb_wholesale_catalog:['p_ref'],mb_wholesale_quote:['p_items'],mb_wholesale_access:['p_user','p_session'],mb_wholesale_submit_account:['p_user','p_session','p_key','p_buyer','p_items','p_ref'],mb_wholesale_own:['p_user','p_session','p_id'],mb_wholesale_manage:['p_actor','p_action','p_data']};
 const admin={rpc:async(name,args)=>{if(!signatures[name])return{data:name==='mb_catalogo_disponibilidad'?[]:{items:[],cantidad:0}};try{return{data:JSON.parse(await db.parallel('set role service_role;select to_jsonb(public.'+name+'('+signatures[name].map(k=>l(args[k])).join(',')+'));'))};}catch(e){return{error:{code:e.message.includes('Acceso exclusivo')||e.message.includes('Sesión mayorista')?'42501':'P0001',message:e.message.split('\n')[0].replace(/^ERROR:\s*/,'')}};}},from:()=>{const chain=new Proxy({}, {get:(_,key)=>key==='then'?r=>r({data:[],error:null}):()=>chain});return chain;},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:null}})})}};
 const config={url:'http://127.0.0.1:54321',secret:'synthetic-local-placeholder',publishable:'synthetic-local-placeholder',origin:'http://127.0.0.1:39339',shippingMode:'mock',paymentsMode:'mock',wholesaleWhatsapp:commercial?'5492266488213':'540000000000',production:false};
 const authFactory=(req,res)=>{
  let sid=parseCookieHeader(req.headers.cookie||'').find(c=>c.name==='mb_fixture_session')?.value;
  let identity=sessions.get(sid)||null;
  if(req.headers['x-local-preview-admin']==='1')identity={id:'33333333-3333-4333-8333-333333333333',email:'admin@fixture.invalid'};
  const issue=user=>{sid=randomUUID();identity=user;sessions.set(sid,user);db.query('insert into auth.sessions(id,user_id)values('+l(sid)+','+l(user.id)+');');res.append('Set-Cookie',serializeCookieHeader('mb_fixture_session',sid,{httpOnly:true,sameSite:'lax',path:'/'}));return{user,session:{access_token:'fixture.'+Buffer.from(JSON.stringify({session_id:sid,sub:user.id})).toString('base64url')+'.local-only'}};};
  return {auth:{
   getUser:async()=>({data:{user:identity}}),
   getSession:async()=>({data:{session:identity?{access_token:'fixture.'+Buffer.from(JSON.stringify({session_id:sid,sub:identity.id})).toString('base64url')+'.local-only'}:null}}),
   signInWithPassword:async({email,password})=>{const user=users.get(email);return user&&password==='fixture-password-only'?{data:issue(user)}:{error:{message:'Invalid local credentials'}};},
   signOut:async()=>{if(sid)db.query('delete from auth.sessions where id='+l(sid)+';');res.append('Set-Cookie',serializeCookieHeader('mb_fixture_session','',{httpOnly:true,sameSite:'lax',path:'/',maxAge:0}));return{};},
   signUp:async({email,options})=>{if(!email.endsWith('@example.invalid'))return{error:{}};const user={id:randomUUID(),email,user_metadata:options.data};db.query('insert into auth.users(id,email,raw_user_meta_data)values('+l(user.id)+','+l(email)+','+l(options.data)+');');const code='fixture-confirm-'+randomUUID();confirmations.set(code,user);lastConfirmation={code,url:options.emailRedirectTo+(options.emailRedirectTo.includes('?')?'&':'?')+'code='+code};return{data:{session:null}};},
   exchangeCodeForSession:async code=>{const user=confirmations.get(code);if(!user)return{error:{}};confirmations.delete(code);users.set(user.email,user);db.query('update auth.users set email_confirmed_at=now() where id='+l(user.id)+';');return{data:issue(user)};},
   verifyOtp:async({token_hash})=>{const user=confirmations.get(token_hash);if(!user)return{error:{}};confirmations.delete(token_hash);users.set(user.email,user);db.query('update auth.users set email_confirmed_at=now() where id='+l(user.id)+';');return{data:issue(user)};},
  },rpc:async(name,args)=>{
   if(name!=='mb_wholesale_profile_complete'||!identity)return{error:{message:'Local RPC denied'}};
   try{return{data:JSON.parse(await db.parallel('set role authenticated;set request.jwt.claim.sub='+l(identity.id)+';select public.mb_wholesale_profile_complete('+l(args.p_data)+');'))};}catch(error){return{error:{message:error.message}};}
  },from:table=>{
   const filters=[];let single=false;const query={select:()=>query,eq:(column,value)=>{filters.push([column,value]);return query;},order:()=>query,maybeSingle:()=>{single=true;return query;},then:async(resolve,reject)=>{try{if(!['perfil','direccion'].includes(table))return resolve({data:[],error:null});const sql='set role authenticated;set request.jwt.claim.sub='+l(identity?.id)+';select coalesce(jsonb_agg(to_jsonb(x)),\'[]\') from(select * from public.'+table+' where '+filters.map(([c,v])=>{if(!['id','usuario_id'].includes(c))throw Error('Invalid fixture field');return c+'='+l(v);}).join(' and ')+')x;';const rows=JSON.parse(await db.parallel(sql));resolve({data:single?rows[0]||null:rows,error:null});}catch(error){reject(error);}}};return query;
  }};
 };
 const {app}=createApp(config,{admin,authFactory});
 const server=app.listen(39339,'127.0.0.1');await new Promise((r,reject)=>{server.once('listening',r);server.once('error',reject);});
 return {base:config.origin,db,users:{alice,bob},get lastConfirmation(){return lastConfirmation;},close:async()=>{await new Promise(r=>server.close(r));db.close();}};
}
