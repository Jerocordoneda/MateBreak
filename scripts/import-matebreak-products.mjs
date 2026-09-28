import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { ORIGIN,hash,canonical,isProduct,parseListing,parseProduct,validateProduct } from './catalog-source.mjs';

const mode=process.argv.includes('--apply')?'apply':'extract';
const refresh=!process.argv.includes('--resume');
const root=path.resolve('.catalog-import');
await mkdir(path.join(root,'pages'),{recursive:true});
await mkdir(path.join(root,'images'),{recursive:true});
const report={started_at:new Date().toISOString(),mode,found:0,processed:0,created:0,updated:0,categories:0,variants:0,images_downloaded:0,images_uploaded:0,images_reused:0,combos:0,errors:[],listings:[],missing:[],review:[]};
async function request(url,binary=false) {
  let last;
  for(let attempt=0;attempt<3;attempt++) {
    try { const res=await fetch(url,{signal:AbortSignal.timeout(45000),headers:{'User-Agent':'MateBreakCatalogMigration/1.0'}});
      if(!res.ok)throw Error(`HTTP ${res.status}: ${url}`);
      return binary?{data:Buffer.from(await res.arrayBuffer()),type:res.headers.get('content-type')?.split(';')[0]}:await res.text();
    } catch(error) { last=error; if(attempt<2)await new Promise(r=>setTimeout(r,500*(attempt+1))); }
  } throw last;
}
async function page(url) {
  const file=path.join(root,'pages',hash(url)+'.html');
  if(!refresh)try{return await readFile(file,'utf8');}catch{}
  const html=await request(url);await writeFile(file,html);return html;
}
async function discover() {
  const urls=new Set(),listingUrls=new Set([ORIGIN+'/',ORIGIN+'/productos/']);
  async function sitemap(url) {
    const xml=load(await page(url),{xml:true});
    for(const n of xml('sitemap > loc').toArray())await sitemap(xml(n).text());
    for(const n of xml('url > loc').toArray()){const u=canonical(xml(n).text());if(isProduct(u))urls.add(u);else if(u)listingUrls.add(u);}
  }
  await sitemap(ORIGIN+'/sitemap.xml');
  const home=await page(ORIGIN+'/'),homeListing=parseListing(home,ORIGIN);
  const homeDOM=load(home),featured=new Set(homeDOM('[data-store="home-products-featured"] a[href]').toArray().map(a=>canonical(homeDOM(a).attr('href'))).filter(isProduct));
  for(const u of homeListing.links) if(!isProduct(u)&&!/(cuenta|account|contacto|comprar|search|cdn-cgi)/.test(u))listingUrls.add(u);
  // Sitemap and every category, including subcategories; traverse all numbered pages
  // used by Tiendanube's Mostrar más/LS.hybridScroll, and verify LS.productsCount.
  for(const base of listingUrls) {
    try {
      const first=parseListing(await page(base),base);
      first.links.filter(isProduct).forEach(u=>urls.add(u));
      for(const u of first.links)if(!isProduct(u)&&!/(cuenta|account|contacto|comprar|search|cdn-cgi|carrito|cart|checkout)/.test(u))listingUrls.add(u);
      if(first.count===null){(report.informational_pages??=[]).push(base);continue;}
      const seen=new Set(first.products);
      let pages=1;
      while(seen.size<first.count&&pages<1000) {
        pages++;
        const next=parseListing(await page(base+'?page='+pages),base);
        const before=seen.size;next.products.forEach(u=>{seen.add(u);urls.add(u);});
        if(seen.size===before)throw Error(`Paginación incompleta ${seen.size}/${first.count}, página ${pages}`);
      }
      report.listings.push({url:base,expected:first.count,found:seen.size,pages});
      console.log(`Categoría ${base}: ${seen.size}/${first.count}, ${pages} páginas`);
      if(seen.size!==first.count)throw Error(`Conteo de categoría cambió: ${seen.size}/${first.count}`);
    }catch(error){report.errors.push({url:base,stage:'discovery',message:error.message});}
  }
  return {urls:[...urls].sort(),featured};
}
async function download(img) {
  const key=hash(img.source_url),metaPath=path.join(root,'images',key+'.json');
  try {const meta=JSON.parse(await readFile(metaPath));const data=await readFile(path.join(root,'images',meta.sha256));if(hash(data)===meta.sha256)return {...img,...meta,data};}catch{}
  const {data,type}=await request(img.source_url,true);
  if(!['image/webp','image/jpeg','image/png','image/gif','image/avif'].includes(type)||!data.length)throw Error('Respuesta de imagen inválida: '+img.source_url);
  const sha256=hash(data),ext={'image/webp':'webp','image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/avif':'avif'}[type];
  const meta={sha256,mime_type:type,bytes:data.length,storage_path:`products/assets/${sha256}.${ext}`};
  await writeFile(path.join(root,'images',sha256),data);await writeFile(metaPath,JSON.stringify(meta));report.images_downloaded++;
  return {...img,...meta,data};
}
async function checked(promise){const r=await promise;if(r.error)throw Error(r.error.message);return r.data;}
let db,existingAssets=new Set();
if(mode==='apply') {
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY;
  if(!url||!key)throw Error('Faltan SUPABASE_URL y credencial administrativa en .env');
  db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const buckets=await checked(db.storage.listBuckets());
  if(!buckets.some(b=>b.id==='product-images'))await checked(db.storage.createBucket('product-images',{public:true,allowedMimeTypes:['image/webp','image/jpeg','image/png','image/gif','image/avif'],fileSizeLimit:52428800}));
  for(let offset=0;;offset+=1000){const rows=await checked(db.from('catalogo_asset').select('sha256').range(offset,offset+999));rows.forEach(r=>existingAssets.add(r.sha256));if(rows.length<1000)break;}
}
const {urls,featured}=await discover();report.found=urls.length;
await writeFile(path.join(root,'discovered.json'),JSON.stringify(urls,null,2));
const products=[];
for(const [index,url] of urls.entries()) {
  try {
    const product=validateProduct(parseProduct(await page(url),url,featured));
    console.log(`[${index+1}/${urls.length}] ${mode==='apply'?'Importando':'Extrayendo'} ${product.nombre}`);
    if(mode==='apply') {
      const imported=[];
      for(const img of product.imagenes) {
        const downloaded=await download(img),{data,...meta}=downloaded;
        if(!existingAssets.has(meta.sha256)) {
          const upload=await db.storage.from('product-images').upload(meta.storage_path,data,{contentType:meta.mime_type,upsert:false,cacheControl:'31536000'});
          if(upload.error&&!['409','400'].includes(String(upload.error.statusCode)))throw Error(upload.error.message);
          if(upload.error){const probe=await db.storage.from('product-images').download(meta.storage_path);if(probe.error||hash(Buffer.from(await probe.data.arrayBuffer()))!==meta.sha256)throw Error('No se pudo verificar imagen existente');}
          else report.images_uploaded++;
          existingAssets.add(meta.sha256);
        }else report.images_reused++;
        imported.push(meta);
      }
      const saved=await checked(db.rpc('mb_importar_catalogo',{p:{...product,imagenes:imported}}));
      report[saved.creado?'created':'updated']++;
      console.log(`  ✓ ${saved.creado?'creado':'actualizado'} · ${imported.length} imágenes · ${product.variantes.length} variantes`);
    }
    products.push(product);report.processed++;report.variants+=product.variantes.length;if(product.tipo==='combo')report.combos++;
    report.review.push(...product.revision.map(reason=>({url,reason})));
  }catch(error){report.errors.push({url,stage:mode,message:error.message});console.error(`  ERROR ${url}: ${error.message}`);}
  await writeFile(path.join(root,'progress.json'),JSON.stringify(report,null,2));
}
report.categories=new Set(products.flatMap(p=>p.categorias.map(c=>c.source_url))).size;
report.image_references=products.reduce((n,p)=>n+p.imagenes.length,0);
report.missing=urls.filter(u=>!products.some(p=>p.source_url===u));
report.finished_at=new Date().toISOString();
await writeFile(path.join(root,'products.json'),JSON.stringify(products,null,2));
await writeFile(path.join(root,`report-${mode}.json`),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,listings:report.listings.length,review:report.review.length},null,2));
if(report.errors.length||report.missing.length||report.processed!==report.found)process.exitCode=1;
