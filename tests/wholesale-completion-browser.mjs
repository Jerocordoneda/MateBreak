import fs from 'node:fs';import assert from 'node:assert/strict';
import {startWholesalePreview} from '../scripts/wholesale-preview-runtime.mjs';
const {chromium}=await import(process.env.MATEBREAK_PLAYWRIGHT_MODULE||'playwright');
const evidence=process.env.MATEBREAK_EVIDENCE_DIR;assert.ok(evidence);fs.mkdirSync(evidence,{recursive:true});
const runtime=await startWholesalePreview({commercial:true}),browser=await chromium.launch({channel:'chrome',headless:true});
const report={source:'Local Chrome + Express + disposable PostgreSQL; synthetic Auth; no API interceptions, no Cloud writes',cases:[]};
try{for(const width of [320,360,390,430,768,1024,1440]){
 // Keep the existing quote limiter enabled: four detailed viewport scenarios
 // fit in a minute; subsequent scenarios wait for its normal window.
 if(report.cases.length===4)await new Promise(resolve=>setTimeout(resolve,60_000));
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 runtime.createLegacyUser('incomplete-'+width+'@example.invalid','Cuenta Existente '+width);
 const response=await context.request.post(runtime.base+'/api/auth/login',{headers:{origin:runtime.base},data:{email:'incomplete-'+width+'@example.invalid',password:'fixture-password-only'}});assert.equal(response.status(),200);await page.goto(runtime.base+'/mayorista');
 await page.locator('.wholesale-product').first().waitFor();await page.waitForFunction(()=>document.querySelector('#wholesale-profile-status').textContent.includes('cargados'));
 assert.equal(await page.locator('#wholesale-completion').count(),0);assert.equal(await page.locator('#wholesale-buyer').isVisible(),false);
 const input=page.locator('[data-variant="700006"] input');assert.equal(await input.inputValue(),'');assert.equal(await input.getAttribute('inputmode'),'numeric');
 for(const amount of [10,50,100,49]){
  await input.fill(String(amount));await page.waitForFunction(t=>document.querySelector('#wholesale-tier').value===String(t)&&!document.querySelector('#wholesale-continue').disabled,amount>=100?100:amount>=50?50:10);
  const quoted=await context.request.post(runtime.base+'/api/mayorista/cotizar',{headers:{origin:runtime.base},data:{items:[{id:'700006',cantidad:amount}]}});assert.equal(quoted.status(),200);const data=await quoted.json();
  const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(v);
  assert.equal(await page.locator('#wholesale-total').textContent(),money(data.total));assert.equal(await page.locator('[data-variant="700006"] .wholesale-price').textContent(),money(data.items[0].unitPrice)+' c/u');assert.equal(await page.locator('[data-variant="700006"] .wholesale-subtotal').textContent(),'Subtotal · '+money(data.items[0].subtotal));
 }
 const second=page.locator('[data-variant="700007"] input');await input.fill('25');await second.fill('25');await page.waitForFunction(()=>document.querySelector('#wholesale-tier').value==='50'&&document.querySelector('#wholesale-total').textContent!=='—');
 const catalog=await (await context.request.get(runtime.base+'/api/mayorista/catalogo')).json();const formatter=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});for(const item of catalog.items)assert.equal(await page.locator('[data-variant="'+item.id+'"] .wholesale-price').textContent(),formatter.format(item.prices['50'])+' c/u');
 await second.fill('');await input.fill('9');await page.waitForFunction(()=>document.querySelector('#wholesale-total').textContent!=='—');assert.equal(await page.locator('#wholesale-continue').isEnabled(),false);
 await input.fill('010');await input.blur();assert.equal(await input.inputValue(),'10');await page.waitForFunction(()=>!document.querySelector('#wholesale-continue').disabled);
 await input.fill('1001');await page.waitForFunction(()=>document.querySelector('#wholesale-continue').disabled);await input.fill('10');await page.waitForFunction(()=>!document.querySelector('#wholesale-continue').disabled);
 await page.locator('#wholesale-continue').click();assert.equal(await page.locator('#wholesale-form [name=nombre]').isVisible(),false);assert.equal(await page.locator('#wholesale-form [name=email]').isVisible(),false);assert.equal(await page.locator('#wholesale-form [name=whatsapp]').isVisible(),true);
 await page.locator('#wholesale-review-data').click();assert.equal(await page.locator('#wholesale-form [name=nombre]').inputValue(),'Cuenta Existente '+width);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 await page.screenshot({path:evidence+'/wholesale-'+width+'.png',fullPage:true});await page.reload();await page.locator('.wholesale-product').first().waitFor();await page.waitForFunction(()=>document.querySelector('#wholesale-profile-status').textContent.startsWith('Datos de tu cuenta')&&!document.querySelector('#wholesale-history-status').textContent.startsWith('Consultando'));assert.equal(await input.inputValue(),'');assert.equal(await page.locator('#wholesale-buyer').isVisible(),false);
 report.cases.push({width,status:'PASS',checks:['catalog first','empty quantities','automatic server tiers 10/50/100/49','card prices and subtotal','invalid quantity blocks continuation','missing data after continue','account defaults','refresh','responsive','no page errors']});await context.close();
}assert.equal(runtime.db.query('select count(*) from private.wholesale_request;'),'0');}
finally{fs.writeFileSync(evidence+'/result.json',JSON.stringify(report,null,2));await browser.close();await runtime.close();}
console.log('PASS '+report.cases.length+' wholesale widths; real local HTTP/SQL; no interceptions');
