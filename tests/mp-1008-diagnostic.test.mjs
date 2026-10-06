import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {readFileSync} from 'node:fs';
import {request as httpRequest} from 'node:http';
import {registerMp1008Diagnostic,readFixedMpDiagnostic,diagnosticPath} from '../server/diagnostics/mp-1008.mjs';
import {createApp} from '../server/app.mjs';
const key='a'.repeat(64),token='APP_USR-synthetic-not-a-credential';
const order='1afd463b-2465-4a57-b702-62777682c8af',pid='182650336328',fid='3741487042-34d265fc-3d18-46c0-a0a2-200a8acceed0';
const identity=async()=>({sellerId:'3741487042',testUser:true});
const base=()=>({staging:true,production:false,shippingMode:'mock',paymentsMode:'real',stagingMpTestEnabled:true,stagingPersistMock:false,
 mercadoPago:{accessToken:token,environment:'test',expectedLiveMode:false,collectorId:'3741487042'},
 mp1008Diagnostic:{enabled:true,key,expiresAt:new Date(Date.now()+60_000).toISOString()}});
const rawPayment={id:Number(pid),status:'approved',status_detail:'accredited',collector_id:3741487042,live_mode:true,external_reference:order,transaction_amount:10000,currency_id:'ARS',date_created:'2026-10-06T11:27:25Z',date_approved:'2026-10-06T11:27:25Z',order:{type:'mercadopago',id:1234},payer:{email:'private@example.test'},card:{number:'PRIVATE'},metadata:{token},authorization_code:token};
const rawPreference={id:fid,client_id:4827641840215059,collector_id:3741487042,external_reference:order,notification_url:'https://matebreak-staging.vercel.app/api/pagos/mercadopago/webhook',payer:{email:'private@example.test'},items:[{title:'PRIVATE'}],headers:{Authorization:token}};
function upstream(calls,alter=()=>{}) {return async(url,options)=>{
 calls.push({url,method:options.method});assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+token);
 const value=structuredClone(url.includes('/v1/payments/')?rawPayment:rawPreference);alter(value,url);
 const r=new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:url});return r;
};}
async function server(t,config=base(),fetcher=upstream([]),verifyIdentity=identity){
 const app=express();registerMp1008Diagnostic(app,{config,verifyIdentity,fetcher});app.use(()=>{throw Error('Unexpected fallthrough');});
 const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));
 return (suffix='',options={})=>fetch(`http://127.0.0.1:${s.address().port}${diagnosticPath}${suffix}`,{headers:{Authorization:'Bearer '+key},...options});
}
test('fixed GETs, minimized whitelist, correct checks and true live_mode reported without override',async()=>{
 const calls=[],r=await readFixedMpDiagnostic({accessToken:token,verifyIdentity:identity,fetcher:upstream(calls)});
 assert.deepEqual(calls.map(c=>c.url),['https://api.mercadopago.com/v1/payments/'+pid,'https://api.mercadopago.com/checkout/preferences/'+fid]);
 assert.equal(r.payment.live_mode,true);assert.equal(r.payment_checks.live_mode_matches_current_guard,false);
 assert.equal(r.expected_live_mode_current_config,false);assert.equal(r.preference_checks.client_id_matches_application,true);
 for(const [k,v]of Object.entries(r.payment_checks))if(k!=='live_mode_matches_current_guard')assert.equal(v,true);
 assert.equal(r.notification_route,'MP → Vercel → Render');assert.deepEqual(r.payment.merchant_order,{id:'1234'});
 const text=JSON.stringify(r);for(const forbidden of ['private@example','PRIVATE',token,'Authorization','payer','card','metadata','items'])assert.equal(text.includes(forbidden),false);
});
test('mismatch checks fail, unknown notification URL and untrusted fields never leak',async()=>{
 const r=await readFixedMpDiagnostic({accessToken:token,verifyIdentity:identity,fetcher:upstream([],v=>{v.id='999';v.client_id=1;v.collector_id=2;v.external_reference='private@example.test';v.transaction_amount=1;v.currency_id='USD';v.status='pending';v.live_mode=false;v.notification_url='https://example.test/?token='+token;v.status_detail=token;})});
 assert.equal(r.payment_checks.payment_id_matches,false);assert.equal(r.payment_checks.status_approved,false);assert.equal(r.payment_checks.collector_matches,false);assert.equal(r.payment_checks.amount_matches,false);assert.equal(r.payment_checks.external_reference_matches,false);assert.equal(r.payment_checks.currency_matches,false);assert.equal(r.payment_checks.live_mode_matches_current_guard,true);
 assert.equal(r.preference_checks.client_id_matches_application,false);assert.equal(r.preference.notification_url,null);assert.equal(r.payment.external_reference,null);assert.equal(r.payment.status_detail,null);assert.equal(JSON.stringify(r).includes(token),false);
});
test('default/off/outside staging/production/missing auth/expiry/mock circuit all fail closed',async t=>{
 const patches=[{mp1008Diagnostic:undefined},{mp1008Diagnostic:{...base().mp1008Diagnostic,enabled:false}},{staging:false},{production:true},{shippingMode:'real'},{paymentsMode:'mock'},{stagingPersistMock:true},{stagingMpTestEnabled:false},{mercadoPago:{...base().mercadoPago,expectedLiveMode:true}},{mercadoPago:{...base().mercadoPago,collectorId:'999'}},{mp1008Diagnostic:{...base().mp1008Diagnostic,key:''}},{mp1008Diagnostic:{...base().mp1008Diagnostic,expiresAt:new Date(Date.now()-1000).toISOString()}},{mp1008Diagnostic:{...base().mp1008Diagnostic,expiresAt:new Date(Date.now()+3*3600000).toISOString()}}];
 for(const patch of patches){const calls=[],request=await server(t,{...base(),...patch},upstream(calls));assert.equal((await request()).status,404);assert.deepEqual(calls,[]);}
});
test('auth fails closed and arbitrary IDs/query/body/subpaths/POST/HEAD cannot fetch',async t=>{
 const calls=[],request=await server(t,base(),upstream(calls));
 assert.equal((await request('',{headers:{}})).status,401);assert.equal((await request('',{headers:{Authorization:'Bearer '+'b'.repeat(64)}})).status,401);
 for(const path of ['?payment_id=123','?preference_id=x','?pedido=1007','/1007'])assert.equal((await request(path)).status,400);
 assert.equal((await request('',{method:'POST',body:'{}'})).status,405);assert.equal((await request('',{method:'HEAD'})).status,405);assert.deepEqual(calls,[]);
});
test('two-run lifetime quota, no-store, no CORS, no cookies, third GET blocked',async t=>{
 const calls=[],request=await server(t,base(),upstream(calls));
 for(let i=0;i<2;i++){const r=await request();assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('access-control-allow-origin'),null);const text=await r.text();assert.equal(text.includes(key),false);assert.equal(text.includes(token),false);}
 assert.equal((await request()).status,429);assert.equal(calls.length,4);
});
test('failed authentication flood has bounded quota and no provider requests',async t=>{
 const calls=[],request=await server(t,base(),upstream(calls));for(let i=0;i<20;i++)assert.equal((await request('',{headers:{}})).status,401);assert.equal((await request('',{headers:{}})).status,429);assert.deepEqual(calls,[]);
});
test('Render generated 256-bit base64 diagnostic secret accepted independently of MP token',async t=>{
 const generated=Buffer.alloc(32,17).toString('base64'),config=base();config.mp1008Diagnostic.key=generated;
 const request=await server(t,config);assert.equal((await request('',{headers:{Authorization:'Bearer '+generated}})).status,200);
});
test('identity failure/mismatch prevents all resource GETs',async()=>{
 for(const verifyIdentity of [async()=>{throw Error(token);},async()=>({sellerId:'999',testUser:true}),async()=>({sellerId:'3741487042',testUser:false})]){
  const calls=[];await assert.rejects(readFixedMpDiagnostic({accessToken:token,verifyIdentity,fetcher:upstream(calls)}),/MP_DIAGNOSTIC_AUTH_FAILED/);assert.deepEqual(calls,[]);
 }
});
test('upstream auth/404/timeout/redirect/invalid JSON/oversized bodies sanitized in HTTP errors',async t=>{
 for(const kind of ['auth','missing','timeout','redirect','invalid','oversized']){
  const fetcher=async(url)=>{if(kind==='timeout')throw Object.assign(Error(token),{stack:token,headers:{Authorization:token}});
   const r=new Response(kind==='invalid'?token:kind==='oversized'?'x'.repeat(262145):JSON.stringify({payer:{email:token}}),{status:kind==='auth'?401:kind==='missing'?404:200,headers:{'content-type':'application/json'}});Object.defineProperty(r,'url',{value:kind==='redirect'?'https://evil.test':url});return r;};
  const request=await server(t,base(),fetcher),r=await request();assert.equal(r.status,502);const body=await r.text();assert.equal(body.includes(token),false);assert.match(body,/MP_(DIAGNOSTIC_(AUTH_FAILED|UPSTREAM_FAILED)|PAYMENT_NOT_FOUND)/);
 }
});
test('real createApp diagnostic bypasses auth, session and DB/RPC middleware even when off',async t=>{
 const config={...base(),url:'https://abcdefghijklmnopqrst.supabase.co',stagingProjectRef:'abcdefghijklmnopqrst',origin:'https://stage.example.test',email:{},mercadoPago:{...base().mercadoPago,webhookSecret:'synthetic'}};
 const admin=new Proxy({},{get(){return ()=>{throw Error('DB access forbidden');};}});
 const provider={ready:true,environment:'test',collectorId:'3741487042',expectedLiveMode:false,verifyTestIdentity:identity};
 const {app}=createApp({...config,mp1008Diagnostic:undefined},{admin,mercadoPago:provider,authFactory:()=>{throw Error('Auth access forbidden');}});
 const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));
 const r=await fetch(`http://127.0.0.1:${s.address().port}${diagnosticPath}`);assert.equal(r.status,404);
 const enabled=createApp(config,{admin,mercadoPago:{...provider,verifyTestIdentity:async()=>{throw Error(token);}},authFactory:()=>{throw Error('Auth access forbidden');}}).app;
 const s2=enabled.listen(0,'127.0.0.1');await new Promise(r=>s2.once('listening',r));t.after(()=>new Promise(r=>s2.close(r)));
 const r2=await fetch(`http://127.0.0.1:${s2.address().port}${diagnosticPath}`,{headers:{Authorization:'Bearer '+key}});assert.equal(r2.status,502);assert.deepEqual(await r2.json(),{code:'MP_DIAGNOSTIC_AUTH_FAILED'});
 const source=readFileSync(new URL('../server/diagnostics/mp-1008.mjs',import.meta.url),'utf8');
 assert.equal(/\b(?:rpc|from|createPreference|reconcilePayment|verifyWebhook)\s*\(/.test(source),false);
 assert.deepEqual([...source.matchAll(/^import .*from '([^']+)'/gm)].map(x=>x[1]),['node:crypto']);
 assert.equal(/console\.|logger\./.test(source),false);
});
test('absolute deadline closes the route without a restart or upstream call',async t=>{
 const app=express(),config=base(),calls=[];let clock=Date.now();config.mp1008Diagnostic.expiresAt=new Date(clock+60_000).toISOString();
 registerMp1008Diagnostic(app,{config,verifyIdentity:identity,fetcher:upstream(calls),now:()=>clock});
 const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));
 clock+=60_001;const r=await fetch(`http://127.0.0.1:${s.address().port}${diagnosticPath}`,{headers:{Authorization:'Bearer '+key}});assert.equal(r.status,404);assert.deepEqual(calls,[]);
});
test('GET with body is rejected before provider access',async t=>{
 const app=express(),calls=[];registerMp1008Diagnostic(app,{config:base(),verifyIdentity:identity,fetcher:upstream(calls)});
 const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));t.after(()=>new Promise(r=>s.close(r)));
 const result=await new Promise((resolve,reject)=>{const req=httpRequest({hostname:'127.0.0.1',port:s.address().port,path:diagnosticPath,method:'GET',headers:{Authorization:'Bearer '+key,'Content-Length':'2'}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end('{}');});
 assert.equal(result,400);assert.deepEqual(calls,[]);
});
