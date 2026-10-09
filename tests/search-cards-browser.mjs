// Isolated browser coverage uses an exported public catalogue snapshot, never Cloud writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import express from 'express';
import {productCardData} from '../server/modules/catalog/routes.mjs';
const {chromium}=await import(pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href),products=JSON.parse(fs.readFileSync(process.env.MATEBREAK_CATALOG_SNAPSHOT)),out=process.env.MATEBREAK_BROWSER_OUTPUT;
fs.mkdirSync(out,{recursive:true});const app=express(),requests=[],errors=[],cases=[];let fail=false,delay=0;
app.use((req,res,next)=>{requests.push({method:req.method,path:req.path,query:req.query});if(req.method!=='GET')return res.sendStatus(405);next();});
app.get('/api/productos',async(req,res)=>{assert.equal(req.query.view,'cards','Search must never request the full catalogue');if(delay)await new Promise(r=>setTimeout(r,delay));if(fail){fail=false;return res.sendStatus(503);}res.json(products.map(productCardData));});
app.get('/api/productos/:slug',(req,res)=>{const p=products.find(p=>p.slug===req.params.slug);p?res.json(p):res.sendStatus(404);});
app.get('/api/sesion',(_,res)=>res.json({usuario:null}));app.get('/api/carrito/resumen',(_,res)=>res.json({cantidad:0}));app.get('/api/carrito',(_,res)=>res.json({items:[],resumen:{subtotal:0,total:0}}));
const routes={'/':'index.html','/tienda':'src/pages/catalogo.html','/mi-cuenta':'src/pages/cuenta.html','/checkout':'src/pages/checkout.html'};
for(const [url,file]of Object.entries(routes))app.get(url,(_,res)=>res.sendFile(path.resolve('dist',file),{dotfiles:'allow'}));
app.get('/productos/:slug',(_,res)=>res.sendFile(path.resolve('dist/src/pages/producto.html'),{dotfiles:'allow'}));app.use(express.static(path.resolve('dist'),{dotfiles:'allow'}));
const server=app.listen(0,'127.0.0.1'),browser=await chromium.launch({channel:'chrome',headless:true}),origin='http://127.0.0.1:'+server.address().port;
try{
 for(const width of [1440,1024,768,390,360]){
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(origin+'/tienda');await p.locator('.catalog-card').first().waitFor();assert.equal(await p.locator('.catalog-card').count(),106);
  const card=p.locator('.catalog-card').first();assert.equal(new URL(await card.locator('.catalog-card-action').getAttribute('href'),origin).pathname,new URL(await card.locator('.catalog-image').getAttribute('href'),origin).pathname);
  assert.equal(await card.locator('img').evaluate(i=>getComputedStyle(i).objectFit),'contain');assert.equal(await p.locator('.catalog-card img[loading=lazy]').count(),104);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await p.screenshot({path:path.join(out,'cards-'+width+'.png')});
  await p.getByRole('button',{name:'Buscar productos',exact:true}).click();const input=p.getByRole('searchbox',{name:'Buscar productos'});await input.fill('calabáza');await p.locator('.mb-search-status').filter({hasText:/productos/}).waitFor();assert.ok(await p.locator('.mb-search-results .catalog-card').count()>0);
  const resultPaths=await p.locator('.mb-search-results .catalog-title').evaluateAll(es=>es.map(e=>new URL(e.href).pathname));
  for(const resultPath of resultPaths){const match=products.find(product=>'/productos/'+encodeURIComponent(product.slug)===resultPath);assert.ok(JSON.stringify([match.nombre,match.descripcion,match.categorias]).toLowerCase().includes('calabaza'));}
  await p.screenshot({path:path.join(out,'search-'+width+'.png')});
  await input.fill('producto inexistente zzz');await p.getByText('No encontramos productos. Probá con otro nombre o material.').waitFor();assert.equal(await p.locator('.mb-search-results .catalog-card').count(),0);
  for(let n=0;n<15;n++){await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.querySelector('dialog').contains(document.activeElement)),true);}
  await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('dialog').open);assert.equal(await p.getByRole('button',{name:'Buscar productos',exact:true}).evaluate(e=>e===document.activeElement),true);
  await p.goto(origin+'/');await p.getByRole('link',{name:'VER TODO'}).waitFor();assert.equal(await p.getByRole('link',{name:'VER TODO'}).getAttribute('href'),'/tienda');
  await context.close();cases.push({width,cards:true,search:true,focus:true,noOverflow:true});
 }
 // Cold delayed request: query changes and closing must discard old UI updates.
 const context=await browser.newContext(),p=await context.newPage();await p.goto(origin+'/mi-cuenta');delay=700;
 await p.getByRole('button',{name:'Buscar productos',exact:true}).click();const input=p.getByRole('searchbox',{name:'Buscar productos'});await input.fill('mate');await p.getByText('Buscando…',{exact:true}).waitFor();await input.fill('zzz inexistente');await p.getByText('No encontramos productos. Probá con otro nombre o material.').waitFor();assert.equal(await p.locator('.mb-search-results .catalog-card').count(),0);
 await input.fill('imperial');await p.keyboard.press('Escape');await p.waitForTimeout(850);assert.equal(await p.locator('dialog').evaluate(e=>e.open),false);await context.close();delay=0;
 const retryContext=await browser.newContext(),retry=await retryContext.newPage();await retry.goto(origin+'/mi-cuenta');fail=true;await retry.getByRole('button',{name:'Buscar productos',exact:true}).click();await retry.getByRole('searchbox',{name:'Buscar productos'}).fill('algarrobo');await retry.getByRole('button',{name:'Reintentar',exact:true}).click();await retry.locator('.mb-search-results .catalog-card').first().waitFor();await retryContext.close();
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'));console.log('PASS search/cards five viewports, canonical selection, keyboard, stale responses, retry and lightweight DTO');
}catch(e){console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({cases,errors,requests},null,2));await browser.close();server.close();}
