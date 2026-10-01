// Offline configuration shared by the preparer, build gate and tests.
import {isDeepStrictEqual} from 'node:util';
export const frontendPages={'/tienda':'catalogo','/carrito':'tienda','/checkout/resultado':'checkout-resultado','/checkout':'checkout','/productos/:slug':'producto','/mi-cuenta':'cuenta'};
export const backendRoutes=['/api/:path*','/auth/:path*','/interno/:path*','/healthz'];
export function validateBackendOrigin(value) {
 if(!value)throw Error('Staging deploy blocked: STAGING_BACKEND_ORIGIN is missing');
 const url=new URL(value);
 if(url.protocol!=='https:' || url.origin!==value || url.username || url.password ||
 /(^localhost$|^127\.|^\[::1\]$|\.(invalid|test|example)$|(^|\.)example\.(com|org|net)$|\.supabase\.co$|(^|\.)matebreak\.com\.ar$)/i.test(url.hostname))
 throw Error('Staging backend must be a confirmed HTTPS origin, without placeholder, database or production-store hosts');
 return url.origin;
}
export function createStagingVercelConfig(backend) {
 return {git:{deploymentEnabled:false},installCommand:'npm ci',buildCommand:'npm run build',outputDirectory:'dist',framework:null,
 rewrites:[...(backend?backendRoutes.map(source=>({source,destination:validateBackendOrigin(backend)+source})):[]),
 ...Object.entries(frontendPages).map(([source,page])=>({source,destination:'/src/pages/'+page+'.html'}))],
 headers:[{source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Cache-Control',value:'no-store'}]}]};
}
// Report only paths from the approved configuration, never actual values or
// untrusted extra key names (which could contain credentials).
function configurationDifferences(actual,expected,path='$') {
 if(isDeepStrictEqual(actual,expected))return [];
 if(Array.isArray(actual)&&Array.isArray(expected)) {
  const differences=actual.length===expected.length?[]:[path+'.length'];
  for(let i=0;i<Math.min(actual.length,expected.length);i++)
   differences.push(...configurationDifferences(actual[i],expected[i],path+'['+i+']'));
  return differences.length?differences:[path];
 }
 if(actual&&expected&&typeof actual==='object'&&typeof expected==='object'&&!Array.isArray(actual)&&!Array.isArray(expected)) {
  const differences=[];
  for(const key of Object.keys(expected)) {
   if(!Object.hasOwn(actual,key))differences.push(path+'.'+key+' (missing)');
   else differences.push(...configurationDifferences(actual[key],expected[key],path+'.'+key));
  }
  if(Object.keys(actual).some(key=>!Object.hasOwn(expected,key)))differences.push(path+' (unexpected keys)');
  return differences.length?differences:[path];
 }
 return [path];
}
export function assertStagingVercelReady(config,backend) {
 const origin=validateBackendOrigin(backend),expected=createStagingVercelConfig(origin);
 if(!isDeepStrictEqual(config,expected)) {
  const differences=configurationDifferences(config,expected);
  throw Error('Staging deploy blocked: vercel.json must be prepared and reviewed for this backend before build; differing paths: '+differences.slice(0,32).join(', ')+(differences.length>32?' (additional differences omitted)':''));
 }
 return origin;
}
