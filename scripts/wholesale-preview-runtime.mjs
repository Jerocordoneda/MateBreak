// Loopback Express + disposable PostgreSQL. This adapter never creates a Supabase client.
import {createApp} from '../server/app.mjs';
import {createWholesaleDatabase,seedWholesale,literal as l} from './wholesale-local-runtime.mjs';
import {readFileSync} from 'node:fs';
export async function startWholesalePreview({commercial=false}={}){
 const db=createWholesaleDatabase();seedWholesale(db.query);
 if(commercial){db.query('update private.wholesale_offer set active=false;');db.query(readFileSync(new URL('../deploy/staging/wholesale-commercial.sql',import.meta.url),'utf8'));}
 const signatures={mb_rol:['p_usuario_id'],mb_inventario_autorizado:['p_usuario_id'],mb_wholesale_catalog:['p_ref'],mb_wholesale_quote:['p_items'],mb_wholesale_submit:['p_owner','p_key','p_buyer','p_items','p_ref'],mb_wholesale_manage:['p_actor','p_action','p_data']};
 const admin={rpc:async(name,args)=>{if(!signatures[name])return{data:name==='mb_catalogo_disponibilidad'?[]:{items:[],cantidad:0}};try{return{data:JSON.parse(await db.parallel('set role service_role;select to_jsonb(public.'+name+'('+signatures[name].map(k=>l(args[k])).join(',')+'));'))};}catch(e){return{error:{code:e.message.includes('Acceso exclusivo')?'42501':'P0001',message:e.message.split('\n')[0].replace(/^ERROR:\s*/,'')}};}},from:()=>{const chain=new Proxy({}, {get:(_,key)=>key==='then'?r=>r({data:[],error:null}):()=>chain});return chain;},storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:null}})})}};
 const config={url:'http://127.0.0.1:54321',secret:'synthetic-local-placeholder',publishable:'synthetic-local-placeholder',origin:'http://127.0.0.1:39339',shippingMode:'mock',paymentsMode:'mock',wholesaleWhatsapp:commercial?'5492266488213':'540000000000',production:false};
 const {app}=createApp(config,{admin,authFactory:req=>({auth:{getUser:async()=>({data:{user:req.headers['x-local-preview-admin']==='1'?{id:'33333333-3333-4333-8333-333333333333',email:'admin@fixture.invalid'}:null}})}})});
 const server=app.listen(39339,'127.0.0.1');await new Promise((r,reject)=>{server.once('listening',r);server.once('error',reject);});
 return {base:config.origin,db,close:async()=>{await new Promise(r=>server.close(r));db.close();}};
}
