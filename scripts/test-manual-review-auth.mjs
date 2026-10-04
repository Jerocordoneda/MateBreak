// Real local Supabase Auth, Mailpit and HTTP. Refuses non-loopback endpoints.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {localStatus,mustSql} from './local-test-runtime.mjs';
const status=localStatus(),origin='http://localhost:3000',jar=new Map();
async function request(url,method='GET',body,cookies=jar){
 const u=new URL(url,origin);assert.ok(['localhost','127.0.0.1'].includes(u.hostname));
 const r=await fetch(u,{method,redirect:'manual',headers:{origin,Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}return r;
}
async function mail(email){for(let n=0;n<30;n++){const list=await(await fetch(status.MAILPIT_URL+'/api/v1/messages')).json();const m=list.messages.find(x=>x.To?.some(v=>v.Address===email));if(m){const item=await(await fetch(status.MAILPIT_URL+'/api/v1/message/'+m.ID)).json();const url=[...item.HTML.matchAll(/href="([^"]+)"/g)].map(x=>x[1].replaceAll('&amp;','&')).find(x=>x.includes('/auth/v1/verify'));if(url)return url;}await new Promise(r=>setTimeout(r,200));}throw Error('Local Mailpit message missing');}
const email='manual-'+randomUUID()+'@example.invalid',password='Local-only-'+randomUUID();
const signup=await request('/api/auth/registro','POST',{nombre:'Ana',apellido:'Local',whatsapp:'2494123456',provincia:'Buenos Aires',localidad:'Tandil',empresa:'Local',email,password,volver:'mayorista'});
assert.equal(signup.status,200);assert.equal((await signup.json()).sesion_iniciada,false);
const pending=await request('/api/sesion');assert.equal((await pending.json()).usuario,null);
const link=await mail(email),verify=await request(link);assert.equal(verify.status,303);
const callback=await request(verify.headers.get('location'));assert.equal(callback.status,302);assert.equal(callback.headers.get('location'),'/mi-cuenta?volver=mayorista&auth=confirmed');
assert.equal((await(await request('/api/sesion')).json()).usuario.email,email);
const profile=await(await request('/api/mayorista/perfil')).json();assert.equal(profile.buyer.localidad,'Tandil');assert.equal(profile.buyer.whatsapp,'2494123456');
const reused=await request(link);assert.ok(reused.headers.get('location').includes('error'));const invalid=await request(reused.headers.get('location'));assert.match(invalid.headers.get('location'),/auth=error/);
await request('/api/auth/logout','POST',{});assert.equal((await request('/api/mayorista/catalogo')).status,401);
const recovery=await request('/api/auth/recover','POST',{email});assert.equal(recovery.status,200);
const recoveryLink=await mail(email),recoveryVerify=await request(recoveryLink);const recoveryCallback=await request(recoveryVerify.headers.get('location'));assert.equal(recoveryCallback.headers.get('location'),'/recuperar-cuenta?estado=cambiar');
assert.equal((await request('/api/auth/recovery-status')).status,200);
const nextPassword='Changed-local-'+randomUUID();assert.equal((await request('/api/auth/password','POST',{password:nextPassword})).status,200);assert.equal((await request('/api/auth/recovery-status')).status,401);
assert.equal((await request('/api/auth/login','POST',{email,password})).status,401);assert.equal((await request('/api/auth/login','POST',{email,password:nextPassword})).status,200);
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const generated=await admin.auth.admin.generateLink({type:'signup',email:'cross-device-'+randomUUID()+'@example.invalid',password:'Local-only-'+randomUUID()});assert.ifError(generated.error);
const fresh=new Map(),input={token_hash:generated.data.properties.hashed_token,type:'email',volver:'mayorista'};
assert.equal((await request('/api/auth/confirmar','POST',input,fresh)).status,200);assert.equal((await request('/api/auth/confirmar','POST',input,new Map())).status,400);
assert.equal((await request('/api/auth/confirmar','POST',{...input,token_hash:'invalid-local-token-123456789'},new Map())).status,400);
const expired=await admin.auth.admin.generateLink({type:'signup',email:'expired-'+randomUUID()+'@example.invalid',password:'Local-only-'+randomUUID()});assert.ifError(expired.error);assert.match(expired.data.user.id,/^[a-f0-9-]{36}$/);
await mustSql("update auth.users set confirmation_sent_at=now()-interval '2 hours' where id='"+expired.data.user.id+"';");
assert.equal((await request('/api/auth/confirmar','POST',{token_hash:expired.data.properties.hashed_token,type:'email'},new Map())).status,400);
console.log('PASS real local Auth + Mailpit: pending signup, PKCE callback, confirmed session, wholesale autofill, reused/invalid link denial, logout, recovery PKCE, password replacement and capability consumed; cross-device explicit OTP POST without verifier; no external email');
