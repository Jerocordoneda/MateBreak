import fs from 'node:fs';import assert from 'node:assert/strict';
import {startWholesalePreview}from'../scripts/wholesale-preview-runtime.mjs';
const {chromium}=await import(process.env.MATEBREAK_PLAYWRIGHT_MODULE||'playwright');
const out=process.env.MATEBREAK_EVIDENCE_DIR;assert.ok(out);fs.mkdirSync(out,{recursive:true});
const runtime=await startWholesalePreview(),browser=await chromium.launch({channel:'chrome',headless:true});
const report={source:'local Chrome/Express/disposable PostgreSQL; synthetic auth provider; no API interceptions or Cloud writes',cases:[],errors:[]};
const routes=['/',...fs.readdirSync(new URL('../src/pages/',import.meta.url)).filter(f=>f.endsWith('.html')&&!/algarrobo-clasico|camionero-premium/.test(f)).map(f=>'/src/pages/'+f)];
try{const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 for(const route of routes){
  await page.goto(runtime.base+route,{waitUntil:'domcontentloaded'});
  for(const width of [320,360,390,430,768,1024,1440]){await page.setViewportSize({width,height:900});
  const brand=page.locator('.mb-brand-link,.mb-site-brand').first();await brand.waitFor();await brand.locator('img').evaluate(img=>img.decode());assert.equal(await brand.locator('img').isVisible(),true,route+' '+width+' logo visible');
  assert.equal(await brand.getAttribute('href'),'/');const box=await brand.boundingBox();assert.ok(box.width>=44&&box.height>=44,route+' '+width+' touch target');assert.ok(box.y>=0&&box.y<210,route+' brand at top');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' '+width+' overflow');assert.match(await page.title(),/MateBreak/i);
  assert.equal(await page.locator('link[rel=icon]').getAttribute('href'),'/src/assets/email/matebreak-logo.png');assert.equal((await context.request.get(runtime.base+'/src/assets/email/matebreak-logo.png')).status(),200);
  await brand.focus();assert.equal(await brand.evaluate(el=>document.activeElement===el),true);
  if([360,1440].includes(width)&&['/','/src/pages/tienda.html','/src/pages/cuenta.html','/src/pages/checkout.html','/src/pages/podcast.html'].includes(route))await page.screenshot({path:out+'/'+(route==='/'?'home':route.split('/').at(-1).replace('.html',''))+'-'+width+'.png',fullPage:true});
  report.cases.push({route,width,status:'PASS'});
 }}assert.deepEqual(report.errors,[]);
}finally{fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));await browser.close();await runtime.close();}
console.log('PASS '+report.cases.length+' public branding layouts, local HTTP/SQL; no interceptions');
