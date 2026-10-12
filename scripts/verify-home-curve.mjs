// Before/after browser proof against b4a2039; public fixtures, loopback only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import express from 'express';
import {productCardData} from '../server/modules/catalog/routes.mjs';
const {chromium}=await import(pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href);
const out=process.env.MATEBREAK_CURVE_PROOF;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const products=JSON.parse(fs.readFileSync(process.env.MATEBREAK_CATALOG_SNAPSHOT));
const files=['src/js/script.js','src/js/header-fade.js','src/css/responsive.css','src/css/public-header.css'];
const before=Object.fromEntries(files.map(f=>[f,execFileSync('git',['show','b4a2039:'+f],{encoding:'utf8'})]));
const root=process.cwd(),app=express(),report={cases:[],errors:[]};
app.get('/api/productos',(_,res)=>res.json(products.map(productCardData)));
app.get('/api/sesion',(_,res)=>res.json({usuario:null}));app.get('/api/carrito/resumen',(_,res)=>res.json({cantidad:0}));
app.get('/api/carrito',(_,res)=>res.json({items:[],resumen:{subtotal:0,total:0}}));
app.use('/api',(_,res)=>res.sendStatus(405));
app.use(express.static(root,{dotfiles:'allow'}));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true}),origin='http://127.0.0.1:'+server.address().port;
// The before browser receives the exact four source files from b4a2039.
async function baselineRoutes(page){await page.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin===origin&&before[url.pathname.slice(1)])return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:before[url.pathname.slice(1)]});
  return route.continue();
});}
const measure=()=>{
  const box=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100);};
  const h=document.querySelector('header'),t=document.querySelector('.matebreak-transition'),c=document.querySelector('.matebreak-curve');
  return {gap:c.getBoundingClientRect().top-h.getBoundingClientRect().bottom,curveTop:c.getBoundingClientRect().top,containerTop:t.getBoundingClientRect().top,relative:c.getBoundingClientRect().top-t.getBoundingClientRect().top,light:h.classList.contains('header-dark'),color:getComputedStyle(h.querySelector('.mb-search-toggle')).color,geometry:[...h.querySelectorAll('.mb-public-mainbar,.mb-public-brand,.mb-public-actions,.mb-search-toggle,.mb-cart-link,.mb-account-link,.mb-category-nav')].map(box),hero:[...document.querySelectorAll('[data-home-hero],[data-scroll-sequence],[data-seq-img],[data-home-actions],.catalog-card')].map(box)};
};
try{
  for(const width of [390,768,1440])for(const reducedMotion of ['no-preference','reduce']){
    const initial=[];
    for(const label of ['before','after']){
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion}),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
      if(label==='before')await baselineRoutes(page);
      await page.goto(origin+'/');await page.locator('.catalog-card').first().waitFor();await page.evaluate(()=>document.fonts.ready);
      await page.locator('[data-seq-img]').evaluate(e=>e.style.setProperty('animation','none','important'));await page.waitForTimeout(1800);await page.waitForFunction(()=>document.querySelector('[data-seq-img]').complete);
      initial.push(await page.evaluate(measure));
      const top=await page.locator('.matebreak-transition').evaluate(e=>e.getBoundingClientRect().top+scrollY);
      const scroll=async position=>{await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),top-position);await page.waitForTimeout(40);return page.evaluate(measure);};
      for(const position of [700,450,250,180,100,0]){
        const state=await scroll(position);
        await page.screenshot({path:path.join(out,`${label}-${width}-${reducedMotion}-${position}.png`)});
        if(label==='after'){
          assert.equal(state.light,state.gap<=0);
          if(state.light)assert.equal(state.color,'rgb(23, 24, 21)');
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
        }
      }
      if(label==='after'){
        const glow=await page.locator('.matebreak-curve').evaluate(e=>({shadow:getComputedStyle(e).boxShadow,border:getComputedStyle(e).borderTopColor,clip:getComputedStyle(e.parentElement).clipPath}));
        assert.ok(glow.shadow.includes('216, 195, 165'));assert.ok(glow.border.includes('216, 195, 165'));assert.ok(glow.clip.includes('-900px'));
        const upper=await scroll(700),lower=await scroll(100);
        if(reducedMotion==='reduce')assert.ok(Math.abs(lower.relative-upper.relative)<.1);else{assert.ok(lower.relative<upper.relative-30);assert.ok(lower.curveTop<lower.containerTop,'Apex must rise above its container without flattening');}
        let low=0,high=250;
        // Find the real contact to a fraction of a CSS pixel, then sample both
        // directions on either side of the line/header intersection.
        for(let i=0;i<14;i++){const mid=(low+high)/2,state=await scroll(mid);if(state.gap<=0)low=mid;else high=mid;}
        const contact=(low+high)/2,states=[];
        for(const delta of [2,1,-1,-2,-1,1,2]){const state=await scroll(contact+delta);assert.equal(state.light,state.gap<=0);assert.deepEqual(state.geometry,initial[1].geometry);states.push({delta,gap:state.gap,light:state.light});}
        assert.ok(states[0].gap>0&&states[2].gap<0&&states.at(-1).gap>0);
        for(const [name,delta]of [['pre-contact',1],['contact',0],['post-contact',-1]]){await scroll(contact+delta);await page.screenshot({path:path.join(out,`${width}-${reducedMotion}-${name}.png`)});}
        const moving=await scroll(contact);await page.waitForTimeout(150);const idle=await page.evaluate(measure);assert.equal(idle.curveTop,moving.curveTop);
        await page.getByRole('button',{name:'Buscar productos',exact:true}).click();await page.getByRole('searchbox',{name:'Buscar productos'}).fill('calabaza');await page.locator('.mb-search-results .catalog-card').first().waitFor();await page.keyboard.press('Escape');
        report.cases.push({width,reducedMotion,contact,states,glow});
      }
      await context.close();
    }
    assert.deepEqual(initial[1].geometry,initial[0].geometry);assert.deepEqual(initial[1].hero,initial[0].hero);
  }
  assert.deepEqual(report.errors,[]);console.log('PASS mobile/tablet/desktop and reduced motion: golden glow, rise, exact contact ±1px both directions, idle stability, unchanged header/hero/cards, search');
}finally{fs.writeFileSync(path.join(out,'curve-proof.json'),JSON.stringify(report,null,2));await browser.close();server.close();}
