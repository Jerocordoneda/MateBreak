import fs from 'node:fs';import assert from 'node:assert/strict';
import {startWholesalePreview} from '../scripts/wholesale-preview-runtime.mjs';
const {chromium}=await import(process.env.MATEBREAK_PLAYWRIGHT_MODULE||'playwright');
const e=process.env.MATEBREAK_EVIDENCE_DIR;assert.ok(e);assert.ok(!fs.realpathSync('.').toLowerCase().startsWith(e.toLowerCase()));fs.mkdirSync(e,{recursive:true});
assert.notEqual(process.env.MATEBREAK_STAGING_E2E,'1','Cloud requests require separate explicit authorization; this suite is local only');const remote=false;
const runtime=remote?null:await startWholesalePreview({commercial:true});
const base=remote?'https://matebreak-staging.vercel.app':runtime.base;
const browser=await chromium.launch({channel:'chrome',headless:true});const report={source:remote?'Staging':'local PostgreSQL',cases:[],errors:[],receipts:[]};
try{for(const width of [1440,360]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
 await page.addInitScript(()=>{window.open=url=>{window.__whatsapp=url;return null;};});
 await context.route('https://wa.me/**',r=>r.abort());page.on('pageerror',err=>report.errors.push(err.message));
 await page.goto(base+'/');const navigation=page.locator('a[data-path=regalos]');assert.equal(await navigation.getAttribute('href'),'/regalos-empresariales');
 const enterprise=page.getByRole('link',{name:'Realizar regalo empresarial',exact:true});assert.equal(await enterprise.getAttribute('href'),'/regalos-empresariales');
 await context.request.post(base+'/api/auth/login',{headers:{origin:base},data:{email:'alice@example.invalid',password:'fixture-password-only'}});await enterprise.click();await page.locator('[data-wholesale-entry]').first().click();await page.waitForFunction(()=>document.querySelectorAll('.wholesale-product').length===11);
 assert.equal(await page.locator('h1').innerText(),'Compra Mayorista.');
 assert.equal(await page.locator('#wholesale-contact').getAttribute('href'),'https://wa.me/5492266488213');
 for(const tier of ['10','50','100']){await page.locator('#wholesale-tier').selectOption(tier);const price=await page.locator('[data-variant="700006"] .wholesale-price').innerText();assert.match(price,new RegExp({'10':'5.000','50':'4.500','100':'3.900'}[tier]));}
 await page.locator('#wholesale-tier').selectOption('10');
 assert.equal(await page.locator('.wholesale-photo img').count(),10);
 await page.locator('.wholesale-photo img').evaluateAll(images=>images.forEach(image=>image.loading='eager'));
 await page.waitForFunction(()=>[...document.querySelectorAll('.wholesale-photo img')].every(i=>i.complete&&i.naturalWidth>0));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:e+'/catalog-'+width+'.png',fullPage:true});
 const card=page.locator('[data-variant="700006"]');
 async function quantity(qty){await card.locator('input').fill(String(qty));await card.locator('button').click();await page.waitForFunction(()=>document.querySelector('#wholesale-total').textContent!=='—');}
 for(const [qty,total] of [[9,'45.000'],[10,'50.000'],[49,'245.000'],[50,'225.000'],[99,'445.500'],[100,'390.000']]){
  await quantity(qty);assert.match(await page.locator('#wholesale-total').innerText(),new RegExp(total));assert.equal(await page.locator('#wholesale-continue').isEnabled(),qty>=10);
 }
 await quantity(10);await page.locator('#wholesale-continue').click();
 for(const [name,value] of Object.entries({nombre:'Prueba Staging Mayorista '+width,empresa:'Validación MateBreak',whatsapp:'1100000000',email:'mayorista-'+width+'@example.invalid',localidad:'Tandil',comentarios:'Prueba técnica autorizada. Sin producción ni contacto real.'}))await page.locator('[name='+name+']').fill(value);
 await page.locator('[name=provincia]').selectOption('Buenos Aires');assert.equal(await page.locator('[name=provincia] option').count(),25);
 await page.screenshot({path:e+'/form-'+width+'.png',fullPage:true});
 await page.locator('#wholesale-submit').click();await page.locator('#wholesale-receipt').waitFor();
 assert.match(await page.locator('#receipt-title').innerText(),/^MAY-/);
 const url=await page.locator('#wholesale-whatsapp').getAttribute('href');assert.equal(new URL(url).pathname,'/5492266488213');
 const message=await page.locator('#wholesale-message').inputValue();assert.match(message,/5[0.]?0?\.000|50\.000/);assert.ok(!message.includes('example.invalid'));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:e+'/receipt-'+width+'.png',fullPage:true});report.receipts.push(await page.locator('#receipt-title').innerText());
 report.cases.push({width,catalog:11,images:10,tiers:'9/10/49/50/99/100 PASS',recipient:'5492266488213',submitted:true,overflow:false});
 await context.close();
 }assert.equal(report.errors.length,0);
}finally{fs.writeFileSync(e+'/browser-result.json',JSON.stringify(report,null,2));await browser.close();if(runtime)await runtime.close();}
console.log(JSON.stringify(report));
