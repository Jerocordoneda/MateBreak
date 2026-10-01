// Generates an artifact; does not contact Vercel/Render.
import './build-frontend.mjs';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
if (!process.env.STAGING_BACKEND_ORIGIN) throw Error('Configure STAGING_BACKEND_ORIGIN before building staging');
const backend = new URL(process.env.STAGING_BACKEND_ORIGIN);
if (backend.protocol !== 'https:' || backend.origin !== process.env.STAGING_BACKEND_ORIGIN || backend.username || backend.password)
  throw Error('STAGING_BACKEND_ORIGIN must be an HTTPS origin');
const pages={'/tienda':'catalogo','/carrito':'tienda','/checkout/resultado':'checkout-resultado','/checkout':'checkout','/productos/:slug':'producto','/mi-cuenta':'cuenta'};
const config={git:{deploymentEnabled:false},buildCommand:'npm run build:staging',outputDirectory:'dist',framework:null,
 rewrites:[...['/api/:path*','/auth/:path*','/interno/:path*','/healthz'].map(source=>({source,destination:backend.origin+source})),
 ...Object.entries(pages).map(([source,page])=>({source,destination:`/src/pages/${page}.html`}))],
 headers:[{source:'/:path*',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Cache-Control',value:'no-store'}]}]};
writeFileSync(resolve(import.meta.dirname,'../vercel.staging.generated.json'),JSON.stringify(config,null,2)+'\n');
console.log('Generated vercel.staging.generated.json; review and use only in staging.');
