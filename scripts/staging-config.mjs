// Offline configuration shared by the preparer, build gate and tests.
import {publicCsp} from '../server/security/public-policy.mjs';
import {isDeepStrictEqual} from 'node:util';
export const frontendPages={'/tienda':'catalogo','/carrito':'tienda','/checkout/resultado':'checkout-resultado','/checkout':'checkout','/productos/:slug':'producto','/mi-cuenta':'cuenta','/mayorista':'mayorista','/regalos-empresariales':'regalos-empresariales','/recuperar-cuenta':'recuperar-cuenta','/podcast':'podcast'};
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
 // CLI 62.0.0 compiles /:path* without matching the literal root slash.
 // Keep its existing coverage and protect the home document explicitly.
 headers:['/','/:path*'].map(source=>({source,headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Cache-Control',value:'no-store'},{key:'Content-Security-Policy',value:publicCsp},{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}]}))};
}
// Diagnostic names only: public Vercel configuration/request properties, not an
// acceptance list. Every additional property still fails isDeepStrictEqual.
// References: https://vercel.com/docs/project-configuration and CLI 62.1.0
// buildVercelConfigSchema (including its experimental properties).
// Request-only names come from CLI 62.1.0 Now.create's requestBody; seeing
// one does not establish its origin or make it valid in root vercel.json.
const diagnosticRootNames=new Set([
 '$schema','version','name','alias','scope','public','regions','functionFailoverRegions',
 'builds','routes','env','build','github','cleanUrls','trailingSlash','functions',
 'redirects','crons','images','ignoreCommand','devCommand','bunVersion','fluid',
 'bulkRedirectsPath','services','relatedProjects','schedules','proxy',
 'experimentalServices','experimentalServiceGroups','experimentalServicesV2',
 'buildMachine','project','meta','target','projectSettings','source','actor','autoAssignCustomDomains',
]);
function rootKeyDiagnostics(actual,expected) {
 const expectedKeys=Object.keys(expected).sort();
 if(!actual||typeof actual!=='object'||Array.isArray(actual))
  return 'root keys: expected='+JSON.stringify(expectedKeys)+'; actual=not an object';
 const actualKeys=Object.keys(actual);
 const safeKeys=actualKeys.filter(key=>Object.hasOwn(expected,key)||diagnosticRootNames.has(key)).sort();
 const additionalKeys=safeKeys.filter(key=>!Object.hasOwn(expected,key));
 // Arbitrary names can themselves contain secrets, even if they look like
 // identifiers. Never interpolate them, their contents, or nested extra keys.
 return 'root keys: expected='+JSON.stringify(expectedKeys)+
  '; actual known='+JSON.stringify(safeKeys)+'; additional known='+JSON.stringify(additionalKeys)+
  '; undisclosed unexpected keys='+(actualKeys.length-safeKeys.length);
}
function fileRootKeyDiagnostics(fileRootKeys,actual,expected) {
 if(fileRootKeys===undefined)return '';
 const evaluatedKeys=actual&&typeof actual==='object'&&!Array.isArray(actual)?Object.keys(actual):null;
 const matches=isDeepStrictEqual(fileRootKeys&&[...fileRootKeys].sort(),evaluatedKeys&&evaluatedKeys.sort());
 if(fileRootKeys===null)return '; file parsed root=not an object; file/evaluated root key sets match='+matches;
 const safeKeys=fileRootKeys.filter(key=>typeof key==='string'&&(Object.hasOwn(expected,key)||diagnosticRootNames.has(key))).sort();
 return '; file parsed known root keys='+JSON.stringify(safeKeys)+
  '; file undisclosed root keys='+(fileRootKeys.length-safeKeys.length)+
  '; file/evaluated root key sets match='+matches;
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
export function assertStagingVercelReady(config,backend,fileRootKeys) {
 const origin=validateBackendOrigin(backend),expected=createStagingVercelConfig(origin);
 if(!isDeepStrictEqual(config,expected)) {
  const differences=configurationDifferences(config,expected);
  throw Error('Staging deploy blocked: vercel.json must be prepared and reviewed for this backend before build; differing paths: '+differences.slice(0,32).join(', ')+(differences.length>32?' (additional differences omitted)':'')+'; '+rootKeyDiagnostics(config,expected)+fileRootKeyDiagnostics(fileRootKeys,config,expected));
 }
 return origin;
}
