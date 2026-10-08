// Isolated UI regression. Fixtures are local; no Cloud requests or orders.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import express from 'express';
const {chromium}=await import(pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href);
const root=fileURLToPath(new URL('../',import.meta.url)),output=process.env.MATEBREAK_HEADER_PROOF;
assert.ok(output);fs.mkdirSync(output,{recursive:true});
const product={id_producto:'25',slug:'imperial-premium-de-boca',nombre:'IMPERIAL PREMIUM DE BOCA',moneda:'ARS',precio:57700,
  categorias:[],imagenes:[],promociones:[],componentes:[],atributos:{},
  opciones:[{nombre:'MODELO DE MATE',valores:['IMPERIAL DE ALGARROBO','IMPERIAL DE CALABAZA']},{nombre:'Agregar BOMBILLA DE ACERO',valores:['NO','SI']}],
  variantes:[57700,63600,73400,79300].map((precio,i)=>({id:String(34+i),precio,comprable:true,con_stock:true,imagen:'/fixture-'+i+'.svg',opciones:{'MODELO DE MATE':i<2?'IMPERIAL DE ALGARROBO':'IMPERIAL DE CALABAZA','Agregar BOMBILLA DE ACERO':i%2?'SI':'NO'}}))};
let catalogRequests=0;const writes=[];
const app=express();app.use(express.json());
app.get('/api/productos',(_,r)=>{catalogRequests++;r.json([product]);});
app.get('/api/sesion',(_,r)=>r.json({usuario:null}));
app.get('/api/carrito/resumen',(_,r)=>r.json({cantidad:0}));
app.get('/api/carrito',(_,r)=>r.json({items:[]}));
app.put('/api/carrito/variantes/:id',async(q,r)=>{writes.push({id:q.params.id,...q.body});await new Promise(done=>setTimeout(done,150));r.json({items:[{cantidad:1}]});});
app.post('/api/compra-directa',(q,r)=>{writes.push(q.body);r.json({next:'/carrito?compra=directa'});});
app.get('/carrito',(_,r)=>r.send('<h1>Carrito directo aislado</h1>'));
app.get('/fixture-:id.svg',(_,r)=>r.type('svg').send('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600"><rect width="480" height="600" fill="#7b5c40"/></svg>'));
app.get('/productos/:slug',(_,r)=>r.sendFile(path.join(root,'dist/src/pages/producto.html'),{dotfiles:'allow'}));
app.use(express.static(path.join(root,'dist'),{dotfiles:'allow'}));
const server=app.listen(0,'127.0.0.1'),browser=await chromium.launch({channel:'chrome',headless:true}),report={cases:[],errors:[]};
try{
 for(const width of [1440,1024,768,390,360]){
  const ctx=await browser.newContext({viewport:{width,height:900}}),page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/productos/${product.slug}`);await page.locator('.product-options').waitFor();
  const requests=catalogRequests,model=page.locator('select').nth(0),bombilla=page.locator('select').nth(1),price=page.locator('.product-pricing .catalog-price'),add=page.getByRole('button',{name:'Agregar al carrito +',exact:true});
  for(const [label,expected] of [['IMPERIAL DE ALGARROBO','57.700'],['IMPERIAL DE CALABAZA','73.400'],['IMPERIAL DE ALGARROBO','57.700']]){
   await model.selectOption(label);assert.ok((await price.textContent()).includes(expected));assert.equal(await add.isEnabled(),false);assert.equal(await page.locator('.product-selected-model').textContent(),label);
  }
  await bombilla.selectOption('NO');await model.selectOption('IMPERIAL DE CALABAZA');await bombilla.selectOption('SI');await bombilla.selectOption('NO');
  assert.equal(await page.locator('#product-content').getAttribute('data-variant-id'),'36');assert.ok((await price.textContent()).includes('73.400'));
  assert.equal(await page.locator('.product-gallery-main img').getAttribute('src'),'/fixture-2.svg');assert.equal(catalogRequests,requests,'Selection makes no async catalog requests');
  // A detached, slow/failed image cannot overwrite the newest selection.
  await page.evaluate(async()=>{const {setProductPhoto}=await import('/src/features/catalog/catalog-ui.js');const frame=document.querySelector('.product-gallery-main');setProductPhoto(frame,'/fixture-0.svg','old',{eager:true});const old=frame.querySelector('img');setProductPhoto(frame,'/fixture-2.svg','current',{eager:true});old.dispatchEvent(new Event('error'));old.dispatchEvent(new Event('load'));});
  assert.equal(await page.locator('.product-gallery-main img').getAttribute('src'),'/fixture-2.svg');
  await add.click();await model.selectOption('IMPERIAL DE ALGARROBO');assert.equal(await add.isEnabled(),false,'Selection cannot re-enable an in-flight submit');
  await page.getByText('Producto agregado. Tu selección está guardada.',{exact:true}).waitFor();assert.deepEqual(writes.at(-1),{id:'36',cantidad:1});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(output,'variant-'+width+'.png')});
  await page.getByRole('button',{name:'Comprar ahora →',exact:true}).click();await page.getByRole('heading',{name:'Carrito directo aislado'}).waitFor();assert.deepEqual(writes.at(-1),{variante_id:'34',cantidad:1,personalizacion:''});
  report.cases.push({width,partial:true,price:true,staleImage:true,cartVariant:'36',directVariant:'34'});await ctx.close();
 }
 for(const reducedMotion of ['no-preference','reduce']){
  const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion}),p=await ctx.newPage();await p.goto(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(await p.locator('[data-scroll-sequence]').evaluate(e=>getComputedStyle(e).marginTop),'-72px');
  assert.equal(await p.locator('[data-seq-img]').evaluate(e=>getComputedStyle(e).animationName),'mateFloat');
  await p.mouse.wheel(0,1800);await p.waitForFunction(()=>document.querySelector('[data-seq-img]').src.includes('frame-060-'));report.cases.push({reducedMotion,frame:60});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);console.log('PASS selection, exact mutation IDs, in-flight guard, stale image, five widths and desktop frame 60 normal/reduced motion');
}catch(e){report.failure=e.message;console.error(e);process.exitCode=1;}finally{fs.writeFileSync(path.join(output,'selection.json'),JSON.stringify(report,null,2));await browser.close();server.close();}
