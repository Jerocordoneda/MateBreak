// TEMPORARY: remove the module, registration and config after investigation #1008.
// No database client, RPC, webhook handler or payment mutation is accessible here.
import {createHash, timingSafeEqual} from 'node:crypto';

export const diagnosticPath='/_staging/diagnostics/mp-1008';
const order='1afd463b-2465-4a57-b702-62777682c8af';
const paymentId='182650336328';
const preferenceId='3741487042-34d265fc-3d18-46c0-a0a2-200a8acceed0';
const sellerId='3741487042', applicationId='4827641840215059';
const numeric=v=>Number.isSafeInteger(v)&&v>=0?String(v):typeof v==='string'&&/^\d{1,30}$/.test(v)?v:null;
const reference=v=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)?v:null;
const date=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?v:null;
const digest=v=>createHash('sha256').update(v).digest();
// Also accept Render's generated base64 256-bit secret; never generate/log it here.
const validKey=v=>typeof v==='string'&&/^(?:[a-f0-9]{64}|[A-Za-z0-9+/]{43}=)$/.test(v);
const failure=(code,status=502)=>Object.assign(new Error(code),{code,status});
const notifications=new Map([
 ['https://matebreak-staging.vercel.app/api/pagos/mercadopago/webhook','MP → Vercel → Render'],
 ['https://matebreak-api-staging.onrender.com/api/pagos/mercadopago/webhook','MP → Render'],
]);

export async function readFixedMpDiagnostic({accessToken,verifyIdentity,fetcher=fetch}) {
 // Reuse the existing fresh authenticated test_user guard; no env verification flag.
 let identity;
 try{identity=await verifyIdentity();}catch{throw failure('MP_DIAGNOSTIC_AUTH_FAILED');}
 if(identity?.sellerId!==sellerId||identity?.testUser!==true)throw failure('MP_DIAGNOSTIC_AUTH_FAILED');
 async function get(resource,phase) {
  const endpoint='https://api.mercadopago.com'+resource;
  try {
   const response=await fetcher(endpoint,{method:'GET',headers:{Authorization:`Bearer ${accessToken}`},redirect:'error',signal:AbortSignal.timeout(10_000)});
   if(response.status===401||response.status===403)throw failure('MP_DIAGNOSTIC_AUTH_FAILED');
   if(response.status===404)throw failure(phase==='payment'?'MP_PAYMENT_NOT_FOUND':'MP_PREFERENCE_NOT_FOUND');
   if(!response.ok||response.status!==200||response.redirected||response.url!==endpoint||!/^application\/json\b/i.test(response.headers.get('content-type')||''))throw failure('MP_DIAGNOSTIC_UPSTREAM_FAILED');
   // Bound memory even if upstream ignores Content-Length. Never propagate raw data.
   const reader=response.body.getReader();let size=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw failure('MP_DIAGNOSTIC_UPSTREAM_FAILED');chunks.push(value);}}
   finally{await reader.cancel().catch(()=>{});}
   const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!value||Array.isArray(value)||typeof value!=='object')throw failure('MP_DIAGNOSTIC_UPSTREAM_FAILED');
   return value;
  }catch(error){
   // Provider exception messages, stacks, request/response and headers never escape.
   const codes=['MP_DIAGNOSTIC_AUTH_FAILED','MP_PAYMENT_NOT_FOUND','MP_PREFERENCE_NOT_FOUND'];
   throw failure(codes.includes(error?.code)?error.code:'MP_DIAGNOSTIC_UPSTREAM_FAILED');
  }
 }
 const p=await get('/v1/payments/'+paymentId,'payment');
 const f=await get('/checkout/preferences/'+preferenceId,'preference');
 const payment={id:numeric(p.id),status:['approved','pending','authorized','in_process','in_mediation','rejected','cancelled','refunded','charged_back'].includes(p.status)?p.status:null,
  status_detail:['accredited','pending_contingency','pending_review_manual','pending_waiting_payment','pending_waiting_transfer','pending_challenge','cc_rejected_other_reason'].includes(p.status_detail)?p.status_detail:null,
  collector_id:numeric(p.collector_id),live_mode:typeof p.live_mode==='boolean'?p.live_mode:null,
  external_reference:reference(p.external_reference),transaction_amount:typeof p.transaction_amount==='number'&&Number.isFinite(p.transaction_amount)?p.transaction_amount:null,
  currency_id:typeof p.currency_id==='string'&&/^[A-Z]{3}$/.test(p.currency_id)?p.currency_id:null,date_created:date(p.date_created),date_approved:date(p.date_approved)};
 // Payment documents order.id, not an invented merchant_order object.
 if(p.order?.type==='mercadopago'&&numeric(p.order.id))payment.merchant_order={id:numeric(p.order.id)};
 const preference={id:typeof f.id==='string'&&/^\d+-[a-f0-9-]{36}$/.test(f.id)?f.id:null,client_id:numeric(f.client_id),collector_id:numeric(f.collector_id),external_reference:reference(f.external_reference),notification_url:notifications.has(f.notification_url)?f.notification_url:null};
 return {diagnostic:'mp-1008',environment:'staging',seller:{id:sellerId,test_user:true},payment,
  expected_live_mode_current_config:false,
  payment_checks:{payment_id_matches:numeric(p.id)===paymentId,status_approved:p.status==='approved',collector_matches:numeric(p.collector_id)===sellerId,external_reference_matches:p.external_reference===order,amount_matches:p.transaction_amount===10000,currency_matches:p.currency_id==='ARS',live_mode_matches_current_guard:p.live_mode===false},
  preference,preference_checks:{preference_id_matches:f.id===preferenceId,client_id_matches_application:numeric(f.client_id)===applicationId,collector_matches:numeric(f.collector_id)===sellerId,external_reference_matches:f.external_reference===order,notification_url_known:notifications.has(f.notification_url)},
  notification_route:notifications.get(f.notification_url)||'UNVERIFIED'};
}

export function registerMp1008Diagnostic(app,{config,verifyIdentity,fetcher=fetch,now=Date.now}) {
 const d=config.mp1008Diagnostic||{}, start=now(), until=Date.parse(d.expiresAt);
 const allowed=config.staging===true&&config.production===false&&config.shippingMode==='mock'&&config.paymentsMode==='real'&&config.stagingMpTestEnabled===true&&config.stagingPersistMock===false&&config.mercadoPago?.environment==='test'&&config.mercadoPago?.expectedLiveMode===false&&String(config.mercadoPago?.collectorId)===sellerId&&Boolean(config.mercadoPago?.accessToken)&&d.enabled===true&&validKey(d.key)&&d.key!==config.mercadoPago.accessToken&&Number.isFinite(until)&&until>start&&until-start<=2*60*60_000;
 const keyHash=allowed?digest(d.key):null;
 let attempts=0,windowStart=start,runs=0;
 // Deliberately registered before session/rate/SQL middleware. All methods and
 // subpaths terminate here, even when disabled: no fallthrough to commercial code.
 app.use(diagnosticPath,async(req,res)=>{
  res.set({'Cache-Control':'no-store, private','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});
  const deny=(status,code)=>res.status(status).json({code});
  if(!allowed||now()>=until)return deny(404,'NOT_FOUND');
  if(now()-windowStart>=600_000){windowStart=now();attempts=0;}
  if(++attempts>20)return deny(429,'MP_DIAGNOSTIC_RATE_LIMIT');
  const auth=req.headers.authorization;
  if(typeof auth!=='string'||!auth.startsWith('Bearer ')||!validKey(auth.slice(7))||!timingSafeEqual(digest(auth.slice(7)),keyHash))return deny(401,'MP_DIAGNOSTIC_UNAUTHORIZED');
  if(req.method!=='GET')return deny(405,'MP_DIAGNOSTIC_METHOD_NOT_ALLOWED');
  if(req.originalUrl!==diagnosticPath||req.headers['transfer-encoding']||Number(req.headers['content-length']||0)!==0)return deny(400,'MP_DIAGNOSTIC_INPUT_FORBIDDEN');
  if(runs>=2)return deny(429,'MP_DIAGNOSTIC_RATE_LIMIT');
  ++runs; // Consume quota before awaiting, including upstream failures.
  try{return res.json(await readFixedMpDiagnostic({accessToken:config.mercadoPago.accessToken,verifyIdentity,fetcher}));}
  catch(error){return deny(502,['MP_DIAGNOSTIC_AUTH_FAILED','MP_PAYMENT_NOT_FOUND','MP_PREFERENCE_NOT_FOUND','MP_DIAGNOSTIC_UPSTREAM_FAILED'].includes(error?.code)?error.code:'MP_DIAGNOSTIC_UPSTREAM_FAILED');}
 });
}
