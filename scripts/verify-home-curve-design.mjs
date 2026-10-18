// Local-only before/after review, with read-only catalogue fixtures.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import express from 'express';
import {productCardData} from '../server/modules/catalog/routes.mjs';
const out=process.env.MATEBREAK_CURVE_PROOF;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const products=JSON.parse(fs.readFileSync(process.env.MATEBREAK_CATALOG_SNAPSHOT));
const changed=['index.html','src/js/home-motion.js','src/js/script.js','src/js/header-fade.js'];
const before=Object.fromEntries(changed.map(file=>[file,execFileSync('git',['show','ff1cf5e:'+file],{encoding:'utf8'})]));
const servers=[];
for(const version of ['before','after']){
  const app=express();
  app.get('/api/productos',(_,res)=>res.json(products.map(productCardData)));
  app.get('/api/sesion',(_,res)=>res.json({usuario:null}));
  app.get('/api/carrito/resumen',(_,res)=>res.json({cantidad:0}));
  app.get('/api/carrito',(_,res)=>res.json({items:[],resumen:{total:0,subtotal:0}}));
  app.use('/api',(_,res)=>res.sendStatus(405));
  app.use('/proof',express.static(out));
  if(version==='before')for(const[file,body]of Object.entries(before)){
    app.get('/'+(file==='index.html'?'':file),(_,res)=>res.type(file.endsWith('.html')?'html':'js').send(body));
  }
  app.use(express.static(path.resolve('dist'),{dotfiles:'allow'}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  servers.push(server);
}
const urls=servers.map(s=>`http://127.0.0.1:${s.address().port}`);
fs.writeFileSync(path.join(out,'preview-urls.json'),JSON.stringify({before:urls[0],after:urls[1]}));
console.log(JSON.stringify({before:urls[0],after:urls[1]}));
if(!process.argv.includes('--serve')){
  const {chromium}=await import(pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href);
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const report={cases:[],errors:[]};
  try{
    const widths=process.env.MATEBREAK_CURVE_WIDTHS?.split(',').map(Number)||[320,360,375,390,414,430,768,1440,1920];
    for(const width of widths){
      for(const [version,origin]of [['before',urls[0]],['after',urls[1]]]){
        if(version==='before'&&![390,768,1440].includes(width))continue;
        const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'});
        const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
        await page.goto(origin,{waitUntil:'networkidle'});await page.locator('.catalog-card').first().waitFor();
        await page.evaluate(()=>document.fonts.ready);
        const pose=await page.locator('[data-seq-img]').evaluate(e=>getComputedStyle(e.parentElement).transform);
        const top=await page.locator('.matebreak-transition').evaluate(e=>e.getBoundingClientRect().top+scrollY);
        await page.evaluate(y=>scrollTo({top:y-220,behavior:'instant'}),top);await page.waitForTimeout(1000);
        if([390,768,1440].includes(width))await page.screenshot({path:path.join(out,`${version}-${width}.png`)});
        if(version==='after'){
          const state=await page.evaluate(()=>{
            const t=document.querySelector('.matebreak-transition'),c=t.querySelector('.matebreak-curve');
            const ridge=c.querySelector('[data-curve-ridge]'),box=ridge.ownerSVGElement.viewBox.baseVal;
            const middle=ridge.getPointAtLength(ridge.getTotalLength()/2),edge=ridge.getPointAtLength(0);
            const white=t.nextElementSibling.getBoundingClientRect(),curve=c.getBoundingClientRect();
            return {overflow:document.documentElement.scrollWidth-innerWidth,shape:{middle:middle.y,edge:edge.y},
              fill:c.querySelector('path[fill="#fff"]').getAttribute('fill'),stroke:getComputedStyle(ridge).strokeWidth,
              gap:white.top-(curve.bottom+curve.height),box:{width:curve.width,height:curve.height},
              overlap:t.previousElementSibling.getBoundingClientRect().bottom-curve.top,
              pose:getComputedStyle(document.querySelector('[data-seq-img]').parentElement).transform,
              viewBox:[box.width,box.height]};
          });
          assert.equal(state.overflow,0);assert.equal(state.fill,'#fff');assert.equal(state.stroke,'2px');
          assert.ok(state.shape.edge-state.shape.middle>600,'Distinct mountain silhouette');
          assert.ok(state.gap<=0,'White extension joins the next section');assert.ok(state.overlap<0,'Mountain does not cover benefits');
          assert.notEqual(state.pose,pose,'Mate keeps its scroll-linked pose');
          for(const y of [top-120,top,top+600,top-120,0]){
            await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await page.waitForTimeout(400);
            assert.ok(await page.evaluate(()=>{const h=document.querySelector('header'),c=document.querySelector('[data-curve-apex]');return h.classList.contains('header-dark')===(c.getBoundingClientRect().top<=h.getBoundingClientRect().bottom);}), 'Header follows actual apex');
          }
          await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(300);
          assert.ok(await page.evaluate(()=>!document.documentElement.hasAttribute('data-mb-home-motion')&&getComputedStyle(document.querySelector('[data-seq-img]').parentElement).transform==='none'));
          await page.evaluate(y=>scrollTo({top:y-220,behavior:'instant'}),top);await page.waitForTimeout(150);
          assert.equal(await page.locator('.matebreak-curve').evaluate(e=>parseFloat(getComputedStyle(e).getPropertyValue('--curve-move'))),0);
          await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(400);
          assert.equal(await page.locator('.mb-curve-glint').count(),1);
          await page.setViewportSize({width:width<=760?1440:390,height:900});await page.waitForTimeout(400);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
          report.cases.push({width,...state});
        }
        await context.close();
      }
      console.log('PASS curve '+width+'px');
    }
    assert.deepEqual(report.errors,[]);
  }finally{fs.writeFileSync(path.join(out,'curve-report.json'),JSON.stringify(report,null,2));await browser.close();servers.forEach(s=>s.close());}
}
