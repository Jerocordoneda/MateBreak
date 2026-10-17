// Compare the restored animations against their approved pre-Motion sources.
// All API fixtures are read-only; no commerce records are created.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import express from 'express';
import {productCardData} from '../server/modules/catalog/routes.mjs';
const {chromium} = await import(pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href);
const output = process.env.MATEBREAK_ROLLBACK_PROOF;
assert.ok(output); fs.mkdirSync(output, {recursive:true});
const original = file => execFileSync('git', ['show', `5b1a591:${file}`], {encoding:'utf8'});
const normalize = text => text.replaceAll('\r\n', '\n');
const files = ['src/js/scroll-sequence.js', 'src/js/script.js', 'src/css/responsive.css'];
for (const file of files) assert.equal(normalize(fs.readFileSync(file,'utf8')), normalize(original(file)), file);
const currentHTML = fs.readFileSync('index.html','utf8');
const priorHTML = execFileSync('git',['show','1597b0f:index.html'],{encoding:'utf8'});
for (const tag of ['header','footer']) {
  const fragment = html => html.match(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`))[0];
  assert.equal(normalize(fragment(currentHTML)), normalize(fragment(priorHTML)), `${tag} markup preserved`);
}
assert.equal(normalize(fs.readFileSync('src/js/header-fade.js','utf8')),
  normalize(execFileSync('git',['show','1597b0f:src/js/header-fade.js'],{encoding:'utf8'})));
const baseline = Object.fromEntries(['index.html', ...files].map(f => [f,original(f)]));
const app = express(), products = JSON.parse(fs.readFileSync(process.env.MATEBREAK_CATALOG_SNAPSHOT));
app.get('/api/productos',(_,res)=>res.json(products.map(productCardData)));
app.get('/api/sesion',(_,res)=>res.json({usuario:null}));
app.get('/api/carrito/resumen',(_,res)=>res.json({cantidad:0}));
app.get('/api/carrito',(_,res)=>res.json({items:[],resumen:{subtotal:0,total:0}}));
app.use('/api',(_,res)=>res.sendStatus(405));
app.use(express.static(path.resolve('dist'),{dotfiles:'allow'}));
const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
const origin=process.env.MATEBREAK_ROLLBACK_URL || `http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={origin,cases:[],errors:[]};
const measure=()=>{
  const img=document.querySelector('[data-seq-img]'),curve=document.querySelector('.matebreak-curve');
  const animation=img.getAnimations()[0];
  // Compare the floating pose at the same time in its original CSS cycle.
  if(animation){animation.pause();animation.currentTime=1000;}
  return {image:img.getAttribute('src'),decoded:img.complete&&img.naturalWidth>0,
    pose:getComputedStyle(img).transform,animation:getComputedStyle(img).animationName,
    curve:getComputedStyle(curve).transform,curveTop:curve.getBoundingClientRect().top,
    overflow:document.documentElement.scrollWidth-innerWidth,
    motionLoaded:!!window.Motion,glow:!!document.querySelector('.mb-curve-glow')};
};
try {
  const widths=process.env.MATEBREAK_ROLLBACK_WIDTHS?.split(',').map(Number)||[390,768,1440];
  for(const width of widths) for(const reducedMotion of ['no-preference','reduce']) {
    const samples=[];
    for(const version of ['baseline','restored']) {
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion});
      const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
      if(version==='baseline') await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
        if(url.origin===origin&&baseline[file])return route.fulfill({contentType:file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'text/javascript',body:baseline[file]});
        return route.continue();
      });
      await page.goto(origin,{waitUntil:'networkidle'});await page.locator('.catalog-card').first().waitFor();
      await page.evaluate(()=>document.fonts.ready);
      const positions=await page.evaluate(()=>{
        const s=document.querySelector('[data-scroll-sequence]').getBoundingClientRect();
        const c=document.querySelector('.matebreak-transition').getBoundingClientRect();
        return [0,s.top+scrollY,s.bottom+scrollY-innerHeight+2,c.top+scrollY-450,c.top+scrollY-100,0];
      });
      const states=[];
      for(const [index,y] of positions.entries()){
        await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),y);await page.waitForTimeout(650);
        const state=await page.evaluate(measure);states.push(state);
        assert.equal(state.overflow,0);assert.ok(state.decoded);assert.equal(state.motionLoaded,false);assert.equal(state.glow,false);
        if(index===3&&reducedMotion==='no-preference')await page.screenshot({path:path.join(output,`${version}-${width}-curve.png`)});
      }
      if(width>760){assert.notEqual(states[0].image,states[2].image);assert.equal(states[0].image,states.at(-1).image);assert.equal(states[0].animation,'mateFloat');}
      else assert.equal(states[0].animation,'none');
      if(version==='restored'){
        assert.equal(await page.locator('header').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(19, 19, 19)');
        if(width>760){const first=await page.locator('[data-seq-img]').evaluate(e=>{e.getAnimations()[0].play();return getComputedStyle(e).transform;});await page.waitForTimeout(300);assert.notEqual(await page.locator('[data-seq-img]').evaluate(e=>getComputedStyle(e).transform),first);}
        if(reducedMotion==='no-preference')await page.screenshot({path:path.join(output,`restored-${width}-top.png`)});
      }
      samples.push(states);await context.close();
    }
    assert.deepEqual(samples[1],samples[0],`${width}px ${reducedMotion}: identical mate and curve`);
    report.cases.push({width,reducedMotion,states:samples[1]});
    console.log(`PASS baseline parity ${width}px / ${reducedMotion}`);
  }
  assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync(path.join(output,'rollback-proof.json'),JSON.stringify(report,null,2));await browser.close();server.close();}
