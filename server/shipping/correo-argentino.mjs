// Backend-only MiCorreo contract. Provider hosts are never client-controlled.
import { randomUUID } from 'node:crypto';
const hosts={test:'https://apitest.correoargentino.com.ar/micorreo/v1',production:'https://api.correoargentino.com.ar/micorreo/v1'};
const provinces=new Set('ABCDEFGHJKLMNPQRSTUVWXYZ'.split(''));
const text=v=>typeof v==='string' && v.trim().length>0;
const postal=v=>text(v) && /^[A-Za-z0-9 -]{4,12}$/.test(v);
export class MiCorreoError extends Error {
 constructor(type,endpoint,status=null,requestId=randomUUID()) {
  super('No se pudo completar la operación de MiCorreo');
  Object.assign(this,{name:'MiCorreoError',provider:'micorreo',type,endpoint:endpoint.split('?')[0],status,requestId});
 }
}
export function numericPrice(v) {
 if(typeof v!=='number' && !(typeof v==='string' && /^\d+(?:\.\d+)?$/.test(v))) return null;
 const n=Number(v);
 return Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*100))?n:null;
}
export function dimensions(v) {
 const out={};
 for(const f of ['weight','height','width','length']) {
  if(!Number.isInteger(v?.[f])||v[f]<1||v[f]>(f==='weight'?25000:150)) throw new MiCorreoError('invalid_dimensions','validation');
  out[f]=v[f];
 }
 return out;
}
export function createCorreoArgentino(config={},fetcher=fetch,runtime={}) {
 const {environment='test',username,password,customerId,originPostalCode}=config;
 if(!Object.hasOwn(hosts,environment)) throw Error('Ambiente de MiCorreo inválido');
 const now=runtime.now||Date.now,sleep=runtime.sleep||(ms=>new Promise(r=>setTimeout(r,ms)));
 const timeout=config.timeoutMs??10000;
 if(!Number.isInteger(timeout)||timeout<1||timeout>30000) throw Error('Timeout inválido');
 const authReady=text(username)&&text(password),ratingReady=authReady&&text(customerId)&&postal(originPostalCode);
 let cached=null,flight=null;
 async function exchange(path,options,retries=0) {
  const id=randomUUID();
  for(let i=0;;i++) {
   let r;
   try {r=await fetcher(hosts[environment]+path,{...options,signal:AbortSignal.timeout(timeout)});}
   catch {throw new MiCorreoError(path==='/shipping/import'?'ambiguous':'transport',path,null,id);}
   if(!r.ok) {
    if(i<retries&&(r.status===429||r.status>=500)){await sleep(100*2**i);continue;}
    let type=r.status===401?'unauthorized':r.status===429?'rate_limit':'http';
    if(path==='/shipping/import') {
     try {const d=await r.json();if(r.status===402&&/orden ya fue importada con anterioridad/i.test(String(d.message)))type='already_imported';}catch{}
     if(r.status>=500)type='ambiguous';
    }
    throw new MiCorreoError(type,path,r.status,id);
   }
   try {return await r.json();}catch {throw new MiCorreoError(path==='/shipping/import'?'ambiguous':'invalid_json',path,r.status,id);}
  }
 }
 async function token() {
  if(!authReady)throw new MiCorreoError('missing_api_credentials','/token');
  if(cached&&cached.until>now()+30000)return cached.value;
  if(!flight)flight=(async()=>{
   const d=await exchange('/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`}});
   if(!text(d?.token))throw new MiCorreoError('invalid_response','/token');
   let until=0;try{until=JSON.parse(Buffer.from(d.token.split('.')[1],'base64url').toString()).exp*1000;}catch{}
   // expires has no timezone. Use JWT exp; otherwise do not cache.
   if(!Number.isFinite(until)||until<=now())until=now();
   cached={value:d.token,until};return d.token;
  })().finally(()=>{flight=null;});
  return flight;
 }
 async function request(path,body,safe=false) {
  const invoke=async()=>exchange(path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${await token()}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})},safe?2:0);
  try{return await invoke();}catch(e){if(safe&&e.type==='unauthorized'){cached=null;return invoke();}throw e;}
 }
 const address=a=>a?{streetName:a.streetName,streetNumber:a.streetNumber,city:a.city,provinceCode:a.provinceCode,postalCode:a.postalCode,floor:String(a.floor||'').slice(0,3),apartment:String(a.apartment||'').slice(0,3)}:undefined;
 return {
  ready:ratingReady,authReady,ratingReady,importReady:authReady&&text(customerId),agenciesReady:authReady&&text(customerId),environment,customerId,
  authenticate:token, // Administrative/backend use only; no HTTP endpoint.
  async quote({destinationPostalCode,deliveryType,dimensions:parcel}) {
   if(!ratingReady)throw new MiCorreoError('missing_rating_configuration','/rates');
   if(!postal(destinationPostalCode)||!['D','S'].includes(deliveryType))throw new MiCorreoError('invalid_destination','/rates');
   const d=await request('/rates',{customerId,postalCodeOrigin:originPostalCode,postalCodeDestination:destinationPostalCode,deliveredType:deliveryType,dimensions:dimensions(parcel)},true);
   if(!Array.isArray(d?.rates)||!text(d.validTo)||!Number.isFinite(Date.parse(d.validTo))||Date.parse(d.validTo)<=now())throw new MiCorreoError('invalid_response','/rates');
   if(d.customerId!==undefined&&d.customerId!==customerId)throw new MiCorreoError('customer_mismatch','/rates');
   return d.rates.filter(r=>r&&r.deliveredType===deliveryType&&numericPrice(r.price)!==null&&text(r.productType)&&text(r.productName)).map(r=>({provider:'correo_argentino',service:r.productType,name:r.productName,deliveryType,carrierCost:numericPrice(r.price),validTo:d.validTo}));
  },
  async agencies(provinceCode) {
   if(!authReady||!text(customerId)||!provinces.has(provinceCode))throw new MiCorreoError('invalid_agencies_configuration','/agencies');
   const d=await request('/agencies?'+new URLSearchParams({customerId,provinceCode,services:'pickup_availability'}),undefined,true);
   if(!Array.isArray(d))throw new MiCorreoError('invalid_response','/agencies');
   return d.filter(a=>a&&/^[A-Z0-9]{2,20}$/.test(a.code)&&text(a.name)&&a.status==='ACTIVE'&&a.services?.pickupAvailability===true&&a.location?.address?.provinceCode===provinceCode&&postal(a.location.address.postalCode));
  },
  async importShipment({extOrderId,orderNumber,sender,recipient,shipping}) {
   if(!authReady||!text(customerId)||!/^[A-Za-z0-9-]{1,80}$/.test(extOrderId)||!text(recipient?.name)||!text(recipient?.email)||!['D','S'].includes(shipping?.deliveryType))throw new MiCorreoError('invalid_import','/shipping/import');
   const parcel=dimensions(shipping);
   if(numericPrice(shipping.declaredValue)===null||(shipping.deliveryType==='S'?!/^[A-Z0-9]{2,20}$/.test(shipping.agency):!text(shipping.address?.streetName)||!text(shipping.address?.streetNumber)||!text(shipping.address?.city)||!provinces.has(shipping.address?.provinceCode)||!postal(shipping.address?.postalCode)))throw new MiCorreoError('invalid_import','/shipping/import');
   const d=await request('/shipping/import',{customerId,extOrderId,orderNumber,sender:sender?{name:sender.name,phone:sender.phone,cellPhone:sender.cellPhone,email:sender.email,originAddress:address(sender.originAddress)}:undefined,recipient:{name:recipient.name,email:recipient.email,phone:recipient.phone,cellPhone:recipient.cellPhone},shipping:{deliveryType:shipping.deliveryType,agency:shipping.deliveryType==='S'?shipping.agency:null,address:shipping.deliveryType==='D'?address(shipping.address):undefined,...parcel,declaredValue:numericPrice(shipping.declaredValue)}});
   if(!text(d?.createdAt)||!Number.isFinite(Date.parse(d.createdAt)))throw new MiCorreoError('ambiguous','/shipping/import');
   return {createdAt:d.createdAt}; // No invented tracking/label capabilities.
  },
  async validateAccount({email,password:accountPassword}) {
   if(!text(email)||!text(accountPassword))throw new MiCorreoError('invalid_account','/users/validate');
   const d=await request('/users/validate',{email,password:accountPassword});
   if(!text(d?.customerId))throw new MiCorreoError('invalid_response','/users/validate');
   return {customerId:d.customerId}; // Account credentials are not retained.
  },
 };
}
