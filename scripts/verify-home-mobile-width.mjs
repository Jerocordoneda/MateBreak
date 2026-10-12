// Before/after full-bleed backgrounds; local fixtures never reach cloud APIs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import express from 'express';
import {productCardData} from '../server/modules/catalog/routes.mjs';
const {chromium}=await import(pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href);
const out=process.env.MATEBREAK_WIDTH_PROOF;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const products=JSON.parse(fs.readFileSync(process.env.MATEBREAK_CATALOG_SNAPSHOT));
const baseline=execFileSync('git',['show','fa7eeb5:src/css/responsive.css'],{encoding:'utf8'});
const app=express(),writes=[],report={cases:[],errors:[],writes};let items=[];
app.use(express.json());app.get('/api/productos',(_,res)=>res.json(products.map(productCardData)));
app.get('/api/productos/:slug',(req,res)=>res.json(products.find(p=>p.slug===req.params.slug)));
app.get('/api/sesion',(_,res)=>res.json({usuario:null}));app.get('/api/carrito/resumen',(_,res)=>res.json({cantidad:items.reduce((n,i)=>n+i.cantidad,0)}));
app.get('/api/carrito',(_,res)=>res.json({items,resumen:{subtotal:0,total:0}}));
app.put('/api/carrito/variantes/:id',(req,res)=>{writes.push(req.body);items=[{variante_id:req.params.id,...req.body}];res.json({items});});
app.use('/api',(_,res)=>res.sendStatus(405));app.use(express.static(process.env.MATEBREAK_WIDTH_DIST?path.resolve('dist'):process.cwd(),{dotfiles:'allow'}));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({channel:'chrome',headless:true}),origin='http://127.0.0.1:'+server.address().port;
const measure=()=>{
 const box=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100);};
 const t=document.querySelector('.matebreak-transition'),c=document.querySelector('.matebreak-curve'),h=document.querySelector('header');
 return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,mainPadding:getComputedStyle(document.querySelector('main')).paddingLeft,
 transition:box(t),curveY:c.getBoundingClientRect().top,contact:h.classList.contains('header-dark'),expected:c.getBoundingClientRect().top<=h.getBoundingClientRect().bottom,
 white:[...document.querySelectorAll('main section.bg-white')].map(box),content:[...document.querySelectorAll('main section.bg-white > [class~="px-margin-desktop"]')].map(e=>box(e.firstElementChild)),
 preserved:[...document.querySelectorAll('header .mb-public-mainbar,header .mb-public-brand,header .mb-public-actions,[data-home-hero],[data-scroll-sequence],[data-seq-img],[data-home-actions],.catalog-card')].map(box),
 glow:getComputedStyle(c).boxShadow};
};
try{
 for(const width of [320,360,375,390,414,430,768,1440]){
  const samples=[];
  for(const label of ['before','after']){
   const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
   if(label==='before')await page.route('**/src/css/responsive.css',r=>r.fulfill({contentType:'text/css',body:baseline}));
   await page.goto(origin+'/');await page.locator('.catalog-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
   await page.locator('[data-seq-img]').evaluate(e=>e.style.setProperty('animation','none','important'));await page.waitForTimeout(1800);
   samples.push(await page.evaluate(measure));
   const top=await page.locator('.matebreak-transition').evaluate(e=>e.getBoundingClientRect().top+scrollY);
   for(const position of [450,120,20]){
    await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),top-position);await page.waitForTimeout(80);
    const state=await page.evaluate(measure);assert.equal(state.contact,state.expected);assert.equal(state.overflow,false);
    await page.screenshot({path:path.join(out,`${label}-${width}-${position}.png`)});
   }
   if(label==='after'){
    await page.getByRole('button',{name:'Buscar productos',exact:true}).click();await page.getByRole('searchbox',{name:'Buscar productos'}).fill('calabaza');await page.locator('.mb-search-results .catalog-card').first().waitFor();await page.keyboard.press('Escape');
    await page.locator('#faq-button-1').scrollIntoViewIfNeeded();await page.locator('#faq-button-1').click();assert.equal(await page.locator('#faq-button-1').getAttribute('aria-expanded'),'true');
   }
   await context.close();
  }
  const [old,current]=samples;assert.deepEqual(current.preserved,old.preserved);assert.deepEqual(current.content,old.content);
  assert.equal(current.overflow,false);assert.equal(current.glow,old.glow);assert.equal(current.curveY,old.curveY);
  if(width<=760){assert.equal(old.transition[0],16);assert.equal(old.transition[2],width-32);assert.equal(current.transition[0],0);assert.equal(current.transition[2],width);for(const box of current.white){assert.equal(box[0],0);assert.equal(box[2],width);}for(const box of current.content)assert.ok(box[0]>=32&&box[0]+box[2]<=width-32+.1);}
  else{assert.deepEqual(current.white,old.white);assert.deepEqual(current.transition,old.transition);}
  report.cases.push({width,before:old,after:current});
 }
 const page=await browser.newPage();await page.goto(origin+'/');await page.locator('.catalog-card').first().waitFor();
 const simple=products.find(p=>p.destacado&&!p.opciones.length&&p.variantes.length===1&&!p.atributos?.personalizable_explicitamente&&!/personaliz/i.test(p.nombre)&&p.variantes[0].comprable&&p.variantes[0].con_stock);
 if(simple){const plus=page.locator('.catalog-card').filter({has:page.locator('.catalog-image[href="/productos/'+simple.slug+'"]')}).locator('.catalog-card-action');await plus.evaluate(e=>{e.click();e.click();});await page.waitForFunction(()=>document.querySelector('[data-cart-badge]').textContent==='1');assert.equal(writes.length,1);}
 assert.deepEqual(report.errors,[]);console.log('PASS 6 mobile widths + tablet/desktop: full-width white/curve, identical inner spacing/header/hero/cards, no overflow, exact contact, search and FAQ');
}finally{fs.writeFileSync(path.join(out,'width-proof.json'),JSON.stringify(report,null,2));await browser.close();server.close();}
