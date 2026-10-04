import fs from 'node:fs';
import assert from 'node:assert/strict';
import {startWholesalePreview} from '../scripts/wholesale-preview-runtime.mjs';
const {chromium}=await import(process.env.MATEBREAK_PLAYWRIGHT_MODULE||'playwright');
const evidence=process.env.MATEBREAK_EVIDENCE_DIR;assert.ok(evidence);fs.mkdirSync(evidence,{recursive:true});
const runtime=await startWholesalePreview({commercial:true}),browser=await chromium.launch({channel:'chrome',headless:true});
const report={source:'local Chrome, Express and disposable SQL; synthetic Auth, no Cloud writes',cases:[]};
try{
 for(const width of [1440,360]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  const check=name=>report.cases.push({width,name,status:'PASS'});
  await page.goto(runtime.base+'/mi-cuenta');await page.locator('#register-tab').click();
  assert.equal(await page.locator('#register-commercial').isVisible(),true);
  assert.equal(await page.locator('#register-commercial [name=whatsapp]').isDisabled(),false);check('Registro general muestra el formulario ampliado');
  runtime.createLegacyUser('incomplete-'+width+'@example.invalid','Cuenta Existente '+width);
  const response=await context.request.post(runtime.base+'/api/auth/login',{headers:{origin:runtime.base},data:{email:'incomplete-'+width+'@example.invalid',password:'fixture-password-only'}});assert.equal(response.status(),200);await page.goto(runtime.base+'/mayorista');
  await page.locator('#wholesale-completion').waitFor();
  const fields=page.locator('#wholesale-completion-fields');
  assert.deepEqual((await fields.locator('[name]').evaluateAll(nodes=>nodes.map(n=>n.name))).sort(),['empresa','localidad','provincia','whatsapp']);
  await fields.locator('[name=whatsapp]').fill('01112345678');await fields.locator('[name=provincia]').selectOption('Buenos Aires');await fields.locator('[name=localidad]').fill('Tandil');await fields.locator('[name=empresa]').fill('Empresa completada');
  await page.screenshot({path:evidence+'/incomplete-'+width+'.png',fullPage:true});check('Cuenta existente solicita únicamente los campos faltantes');
  let failed=false;await page.route('**/api/mayorista/perfil/completar',route=>{if(!failed){failed=true;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Error local recuperable'})});}return route.continue();});
  await page.locator('#wholesale-completion-form button').click();await page.waitForFunction(()=>document.querySelector('#wholesale-completion-status').textContent.includes('recuperable'));
  assert.equal(await fields.locator('[name=whatsapp]').inputValue(),'01112345678');await page.locator('#wholesale-completion-form button').click();await page.waitForFunction(()=>document.querySelector('#wholesale-completion').hidden);
  assert.equal(await page.locator('#wholesale-form [name=nombre]').inputValue(),'Cuenta Existente '+width);assert.equal(await page.locator('#wholesale-form [name=empresa]').inputValue(),'Empresa completada');check('Error recuperable conserva datos; reintento completa y autocompleta');
  await page.locator('[data-variant="700006"] input').fill('10');await page.locator('[data-variant="700006"] button').click();await page.waitForFunction(()=>!document.querySelector('#wholesale-continue').disabled);await page.locator('#wholesale-continue').click();
  await page.locator('#wholesale-form [name=nombre]').fill('Dato privado sin enviar');await page.screenshot({path:evidence+'/completed-form-'+width+'.png',fullPage:true});
  await context.request.post(runtime.base+'/api/auth/logout',{headers:{origin:runtime.base},data:{}});
  await page.evaluate(()=>{const channel=new BroadcastChannel('matebreak-auth');channel.postMessage('logout');channel.close();});
  await page.waitForURL('**/mi-cuenta?volver=mayorista');assert.equal(await page.locator('#wholesale-form').count(),0);assert.equal((await context.request.get(runtime.base+'/api/mayorista/perfil')).status(),401);
  await page.screenshot({path:evidence+'/logout-'+width+'.png',fullPage:true});check('Logout durante formulario limpia datos privados y bloquea API');await context.close();
 }
 assert.equal(runtime.db.query('select count(*) from private.wholesale_request;'),'0');
}finally{fs.writeFileSync(evidence+'/result.json',JSON.stringify(report,null,2));await browser.close();await runtime.close();}
console.log('PASS '+report.cases.length+' completion/recovery/logout Chrome cases');
