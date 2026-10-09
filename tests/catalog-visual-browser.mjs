// Browser regression, using a static local build and synthetic read-only API.
// Supply MATEBREAK_BROWSER_MODULE (Playwright index.mjs) when it is not installed.
// Optional MATEBREAK_TAILWIND_SCRIPT uses a locally cached public CDN script.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.MATEBREAK_BROWSER_MODULE?pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href:'playwright');
const root=resolve('dist'),out=process.env.MATEBREAK_BROWSER_OUTPUT||mkdtempSync(join(tmpdir(),'matebreak-catalog-visual-'));
mkdirSync(out,{recursive:true});
const aliases={'/':'index.html','/tienda':'src/pages/catalogo.html','/productos/fixture':'src/pages/producto.html','/carrito':'src/pages/tienda.html','/mi-cuenta':'src/pages/cuenta.html'};
const photo='<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600"><rect width="480" height="600" fill="#d8c3a5"/></svg>';
const server=createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/audit/photo.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml','Cache-Control':'no-store'}).end(photo);return;}
 const file=resolve(root,aliases[path]||decodeURIComponent(path).replace(/^\//,''));
 if(!file.startsWith(root+'/')&&!file.startsWith(root+'\\')){res.writeHead(403).end();return;}
 try{const body=readFileSync(file);res.writeHead(200,{'Content-Type':{'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json'}[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(body);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.MATEBREAK_CHROME_PATH?{executablePath:process.env.MATEBREAK_CHROME_PATH}:{})});
const results=[],writes=[];
const product=()=>({id_producto:'13',slug:'fixture',nombre:'Mate de prueba',descripcion:'Sólo fixture local',precio:10000,precio_original:10000,moneda:'ARS',tipo:'simple',destacado:false,disponible:true,descuento:0,categorias:[],opciones:[],variantes:[{id:'2',opciones:{},precio:10000,comprable:true,con_stock:true,imagen:null}],imagen_principal:null,imagenes:[],promociones:[],componentes:[],atributos:{}});
async function context(width,data){
 const c=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
 await c.route('**/*',r=>{
  const q=r.request(),u=new URL(q.url());
  if(q.method()!=='GET'){writes.push(u.pathname);return r.abort();}
  if(u.hostname==='cdn.tailwindcss.com'&&process.env.MATEBREAK_TAILWIND_SCRIPT)return r.fulfill({contentType:'application/javascript',body:readFileSync(process.env.MATEBREAK_TAILWIND_SCRIPT,'utf8')});
  if(u.origin===origin&&u.pathname.startsWith('/api/')){
   const body=u.pathname==='/api/productos'?[data]:u.pathname==='/api/productos/fixture'?data:u.pathname==='/api/sesion'?{usuario:null}:u.pathname==='/api/carrito/resumen'?{cantidad:0}:u.pathname==='/api/carrito'?{items:[],subtotal:0,moneda:'ARS'}:{};
   return r.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  }
  if(u.origin!==origin&&!['fonts.googleapis.com','fonts.gstatic.com','cdn.tailwindcss.com','lh3.googleusercontent.com'].includes(u.hostname))return r.abort();
  return r.continue();
 });return c;
}
async function settled(p,url){await p.goto(origin+url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>{const el=document.querySelector('[data-catalog],#product-content');return el&&!el.textContent.includes('Cargando');});}
async function noOverflow(p){assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');}
try{
 for(const width of [1440,360]){
  let noPhotoSize;
  for(const mode of ['missing','photo','failed','invalid','variant-photo']){
   const data=product();
   if(mode==='photo'||mode==='failed'){const url=mode==='photo'?'/audit/photo.svg':'/audit/missing.svg';data.imagen_principal=url;data.imagenes=[{url,rol:'galeria'}];if(mode==='photo')data.imagenes.push({url:'/audit/photo.svg?second=1',rol:'galeria'});}
   if(mode==='invalid'){data.imagen_principal=' ';data.imagenes=[{url:null,rol:'galeria'},{url:'',rol:'descripcion'}];}
   if(mode==='variant-photo')data.variantes[0].imagen='/audit/photo.svg';
   const c=await context(width,data),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   await settled(p,'/tienda');
   const frame=p.locator('.catalog-image');
   if(mode==='photo')await frame.locator('img').evaluate(img=>img.complete?Promise.resolve():new Promise(r=>img.addEventListener('load',r,{once:true})));
   else await frame.locator('.product-photo-placeholder').waitFor({state:'visible'});
   const size=await frame.boundingBox();assert.ok(Math.abs(size.width/size.height-.8)<.01,'Card aspect ratio');
   if(mode==='missing')noPhotoSize=size;
   if(mode==='photo')assert.equal(Math.round(size.height),Math.round(noPhotoSize.height),'Photo and placeholder dimensions');
   assert.equal(await p.locator('.catalog-card').count(),1);await noOverflow(p);
   await p.locator('.catalog-title').click();await p.waitForURL(origin+'/productos/fixture');await p.locator('.product-options').waitFor();
   const gallery=p.locator('.product-gallery-main');
   if(['photo','variant-photo'].includes(mode)){await gallery.locator('img').waitFor();await p.waitForFunction(()=>document.querySelector('.product-gallery-main img')?.naturalWidth>0);assert.equal(await gallery.locator('.product-photo-placeholder').count(),0);}
   else await gallery.locator('.product-photo-placeholder').waitFor({state:'visible'});
   if(mode==='photo'){
    await p.getByRole('button',{name:'Ver imagen 2',exact:true}).click();
    assert.equal(await gallery.locator('img').getAttribute('src'),'/audit/photo.svg?second=1');
    assert.equal(await p.getByRole('button',{name:'Ver imagen 2',exact:true}).getAttribute('aria-pressed'),'true');
   }
   if(mode==='failed')await p.locator('.product-thumbnails .product-photo-placeholder').waitFor({state:'visible'});
   assert.equal(await p.locator('#product-content img:not([src]),#product-content img[src=""]').count(),0);
   const gallerySize=await gallery.boundingBox(),maxHeight=await gallery.evaluate(e=>getComputedStyle(e).maxHeight);
   // The existing small-screen detail caps gallery height; images remain
   // contained. Do not confuse that approved cap with a card ratio regression.
   if(maxHeight==='none')assert.ok(Math.abs(gallerySize.width/gallerySize.height-.8)<.01,'Gallery aspect ratio');
   else assert.ok(gallerySize.height<=parseFloat(maxHeight)+1,'Mobile gallery height cap');
   await noOverflow(p);
   assert.equal(await p.locator('[data-cart-link]').getAttribute('href'),'/carrito');assert.equal(await p.locator('[data-account-link]').getAttribute('href'),'/mi-cuenta');
   if(mode==='missing')await p.screenshot({path:resolve(out,'detail-'+width+'.png'),fullPage:true});
   assert.deepEqual(errors,[]);results.push({width,test:'card/gallery '+mode,pass:true});await c.close();
  }
  for(const featured of [false,true]){
   const data=product();data.destacado=featured;const c=await context(width,data),p=await c.newPage();await settled(p,'/');
   const section=p.locator('[data-catalog="featured"]');assert.equal(await section.locator('.catalog-card').count(),featured?1:0);
   if(!featured){assert.equal(await section.locator('.catalog-empty').count(),1);const link=section.getByRole('link',{name:'Ver catálogo',exact:true});assert.equal(await link.getAttribute('href'),'/tienda');await section.scrollIntoViewIfNeeded();await section.screenshot({path:resolve(out,'featured-empty-'+width+'.png')});await link.click();await p.waitForURL(origin+'/tienda');await p.locator('.catalog-card').waitFor();await p.screenshot({path:resolve(out,'shop-'+width+'.png'),fullPage:true});await p.locator('[data-cart-link]').click();await p.waitForURL(origin+'/carrito');await p.goBack();await p.locator('.catalog-card').waitFor();await p.locator('[data-account-link]').click();await p.waitForURL(origin+'/mi-cuenta');}
   else assert.equal(await section.locator('.catalog-empty').count(),0);
   await noOverflow(p);results.push({width,test:'featured '+featured+'; navigation',pass:true});await c.close();
  }
  for(const consistent of [false,true]){
   const data=product();data.opciones=[{nombre:'BOMBILLA ACERO INOX',valores:['NO','SI']}];data.variantes[0].opciones=consistent?{'BOMBILLA ACERO INOX':'NO'}:{modelo:'Fixture'};
   const c=await context(width,data),p=await c.newPage();await settled(p,'/productos/fixture');await p.locator('.product-options select').selectOption('NO');
   assert.equal(await p.getByRole('button',{name:'Agregar al carrito +',exact:true}).isEnabled(),consistent);
   await p.locator('.product-options select').selectOption('SI');assert.equal(await p.getByRole('button',{name:'Agregar al carrito +',exact:true}).isEnabled(),false);
   if(!consistent)await p.screenshot({path:resolve(out,'detail-incompatible-options-'+width+'.png'),fullPage:true});
   results.push({width,test:'selection contract consistent='+consistent,pass:true});await c.close();
  }
 }
 assert.deepEqual(writes,[],'Browser attempted a write');writeFileSync(resolve(out,'results.json'),JSON.stringify({results,writes},null,2));console.log(JSON.stringify({result:'PASS',cases:results.length,widths:[1440,360],writes:0},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}

