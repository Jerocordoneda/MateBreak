import {createHmac,timingSafeEqual} from 'node:crypto';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {requestPasswordRecovery,completePasswordRecovery} from '../email/password-recovery.mjs';
import {requireLiveSession} from './live-session.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export function recoveryRoutes(app,{config,admin,authFactory}){
 const secure=config.origin.startsWith('https:'),name=(secure?'__Host-':'')+'mb_recovery';
 const sign=value=>createHmac('sha256',config.secret).update('recovery\0'+value).digest('base64url');
 const cookie=(res,value,maxAge)=>res.append('Set-Cookie',serializeCookieHeader(name,value,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge}));
 const clear=res=>cookie(res,'',0);
 async function proof(req){
  await requireLiveSession(req,admin);
  const value=parseCookieHeader(req.headers.cookie??'').find(x=>x.name===name)?.value||'';
  const [id,expiry,mac,...extra]=value.split('.'),body=id+'.'+expiry,expected=sign(body);
  if(extra.length||id!==req.liveSessionId||! /^\d{13}$/.test(expiry)||Number(expiry)<Date.now()||Number(expiry)>Date.now()+600001||mac?.length!==expected.length||!timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))throw fail(401,'El enlace venció o no es válido. Solicitá uno nuevo.');
  return true;
 }
 app.post('/api/auth/recover',async(req,res)=>res.json(await requestPasswordRecovery({auth:req.auth,email:req.body?.email,origin:config.origin,enabled:config.authRecoveryEnabled,allowLocal:!config.production&&!config.staging})));
 app.get('/auth/recuperar',async(req,res)=>{
  res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});clear(res);
  if(!config.authRecoveryEnabled||typeof req.query.code!=='string')return res.redirect('/recuperar-cuenta?estado=invalido');
  const auth=authFactory(req,res),r=await auth.auth.exchangeCodeForSession(req.query.code);
  // A signup/login code cannot grant password-recovery capability.
  if(r.error||r.data?.redirectType!=='recovery')return res.redirect('/recuperar-cuenta?estado=invalido');
  const verified=await auth.auth.getUser();req.auth=auth;req.user=verified.error?null:verified.data?.user;
  try{await requireLiveSession(req,admin);}catch{return res.redirect('/recuperar-cuenta?estado=invalido');}
  const body=req.liveSessionId+'.'+(Date.now()+600000);cookie(res,body+'.'+sign(body),600);
  res.redirect('/recuperar-cuenta?estado=cambiar');
 });
 app.get('/api/auth/recovery-status',async(req,res)=>{await proof(req);res.json({ok:true});});
 app.post('/api/auth/password',async(req,res)=>{
  await proof(req);
  const result=await completePasswordRecovery({auth:req.auth,password:req.body?.password,enabled:config.authRecoveryEnabled,verifyLiveSession:async()=>proof(req)});
  clear(res);await req.auth.auth.signOut({scope:'global'});res.json(result);
 });
 return {clear};
}
