import fs from 'node:fs';import assert from 'node:assert/strict';
import {startWholesalePreview} from '../scripts/wholesale-preview-runtime.mjs';
const {chromium}=await import(process.env.MATEBREAK_PLAYWRIGHT_MODULE||'playwright');
const evidence=process.env.MATEBREAK_EVIDENCE_DIR;assert.ok(evidence);fs.mkdirSync(evidence,{recursive:true});
const runtime=await startWholesalePreview({commercial:true}),browser=await chromium.launch({channel:'chrome',headless:true});
const report={source:'actual local Chrome + Express + isolated PostgreSQL; synthetic Auth provider, no Cloud/no mail/no WhatsApp',cases:[],errors:[]};
const baseline=runtime.db.query("select jsonb_build_object('profile',(select jsonb_agg(to_jsonb(p) order by id) from public.perfil p),'address',(select jsonb_agg(to_jsonb(d) order by id) from public.direccion d),'stock',(select jsonb_agg(to_jsonb(s) order by id_producto) from public.producto_simple s),'orders',(select count(*) from public.pedido),'payments',(select count(*) from public.pago));");
try{
 for(const width of [1440,360]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  await context.route('**/*',route=>{const url=new URL(route.request().url());return url.origin===runtime.base||['fonts.googleapis.com','fonts.gstatic.com','cdn.tailwindcss.com','lh3.googleusercontent.com'].includes(url.hostname)?route.continue():route.abort();});
  await page.addInitScript(()=>{window.open=url=>{window.__whatsapp=url;return null;};});page.on('pageerror',error=>report.errors.push(error.message));
  const check=(name)=>report.cases.push({width,name,status:'PASS'});
  const get=path=>context.request.get(runtime.base+path);
  const post=(path,data)=>context.request.post(runtime.base+path,{headers:{origin:runtime.base},data});
  await page.goto(runtime.base+'/');
  for(const link of [page.locator('a[data-path=regalos]'),page.getByRole('link',{name:'Realizar pedido mayorista →',exact:true}),page.getByRole('link',{name:'Realizar regalo empresarial',exact:true})])assert.equal(await link.getAttribute('href'),'/regalos-empresariales');
  check('Tres accesos del Inicio → presentación');
  await page.goto(runtime.base+'/regalos-empresariales');await page.locator('.wholesale-proposal').waitFor();
  assert.equal(await page.locator('h1').innerText(),'COMPRA MAYORISTA');assert.equal(await page.locator('.wholesale-price').count(),0);
  await page.waitForFunction(()=>[...document.querySelectorAll('main img')].every(i=>i.complete&&i.naturalWidth>0));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:evidence+'/presentation-'+width+'.png',fullPage:true});check('Presentación pública, fotografía original, sin tarifas');
  await page.locator('.wholesale-proposal').screenshot({path:evidence+'/proposal-'+width+'.png'});
  await page.locator('[data-wholesale-entry]').first().click();await page.waitForURL('**/mi-cuenta?volver=mayorista');await page.locator('#signin').waitFor();await page.screenshot({path:evidence+'/login-'+width+'.png',fullPage:true});check('CTA invitado → Login/Registro');
  for(const path of ['catalogo','perfil','solicitudes'])assert.equal((await get('/api/mayorista/'+path)).status(),401);
  assert.equal((await post('/api/mayorista/cotizar',{items:[{id:'700006',cantidad:10}]})).status(),401);
  assert.equal((await post('/api/mayorista/solicitudes',{})).status(),401);check('Endpoints privados rechazan invitados');
  await page.goto(runtime.base+'/mayorista');await page.waitForURL('**/mi-cuenta?volver=mayorista');assert.equal(await page.locator('.wholesale-price').count(),0);check('URL directa sin exposición privada');
  await page.locator('#signin [name=email]').fill('alice@example.invalid');await page.locator('#signin [name=password]').fill('fixture-password-only');await page.locator('#signin-submit').click();await page.waitForURL('**/mayorista');await page.waitForFunction(()=>document.querySelectorAll('.wholesale-product').length===11);check('Login → catálogo automático');
  await page.goto(runtime.base+'/regalos-empresariales');await page.locator('[data-wholesale-entry]').first().click();await page.waitForURL('**/mayorista');await page.waitForFunction(()=>document.querySelectorAll('.wholesale-product').length===11);check('Sesión válida → catálogo directo');
  await page.waitForFunction(()=>document.querySelector('#wholesale-profile-status').textContent.startsWith('Datos de tu cuenta'));
  assert.equal(await page.locator('[name=nombre]').inputValue(),'Ana Pérez');assert.equal(await page.locator('[name=email]').inputValue(),'alice@example.invalid');
  await page.locator('.wholesale-photo img').evaluateAll(images=>images.forEach(image=>image.loading='eager'));
  await page.waitForFunction(()=>[...document.querySelectorAll('.wholesale-photo img')].every(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({path:evidence+'/catalog-'+width+'.png',fullPage:true});
  const card=page.locator('[data-variant="700006"]');
  for(const [qty,total] of [[9,'45.000'],[10,'50.000'],[49,'245.000'],[50,'225.000'],[99,'445.500'],[100,'390.000'],[10,'50.000']]){
   await card.locator('input').fill(String(qty));await card.locator('button').click();await page.waitForFunction(()=>document.querySelector('#wholesale-total').textContent!=='—');assert.match(await page.locator('#wholesale-total').innerText(),new RegExp(total));assert.equal(await page.locator('#wholesale-continue').isEnabled(),qty>=10);
  }check('Once ofertas, tramos y mínimo combinados intactos');
  await page.locator('#wholesale-continue').click();assert.equal(await page.locator('#wholesale-address option').count(),3);
  await page.locator('#wholesale-address').selectOption('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');assert.equal(await page.locator('[name=localidad]').inputValue(),'Córdoba');assert.equal(await page.locator('[name=provincia]').inputValue(),'Córdoba');assert.equal(await page.locator('[name=whatsapp]').inputValue(),'1144444444');check('Datos de cuenta y elección de direcciones');
  await page.locator('[name=nombre]').fill('Ana solicitud editada '+width);await page.locator('[name=email]').fill('comercial-'+width+'@example.invalid');await page.locator('[name=comentarios]').fill('Prueba local aislada.');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:evidence+'/form-'+width+'.png',fullPage:true});check('Datos comerciales editables');
  await page.locator('#wholesale-buyer').screenshot({path:evidence+'/buyer-'+width+'.png'});
  // Simulate a response lost after the server committed: the same payload/key
  // must recover one request, even when the current catalog price changes.
  let dropped=false;await page.route('**/api/mayorista/solicitudes',async route=>{if(route.request().method()==='POST'&&!dropped){dropped=true;await route.fetch();return route.abort('failed');}return route.continue();});
  await page.locator('#wholesale-submit').click();await page.waitForFunction(()=>document.querySelector('#wholesale-status').textContent.includes('reintentar'));
  await page.locator('#wholesale-submit').click();await page.locator('#wholesale-receipt').waitFor();await page.unroute('**/api/mayorista/solicitudes');
  assert.match(await page.locator('#receipt-title').innerText(),/^MAY-/);assert.match(await page.locator('#receipt-total').innerText(),/50.000/);assert.equal(new URL(await page.locator('#wholesale-whatsapp').getAttribute('href')).pathname,'/5492266488213');await page.screenshot({path:evidence+'/receipt-'+width+'.png',fullPage:true});
  const rows=await (await get('/api/mayorista/solicitudes')).json();assert.equal(rows.filter(r=>r.buyer.nombre==='Ana solicitud editada '+width).length,1);check('Identidad, cotización guardada, recibo y replay tras respuesta perdida');
  const other=await browser.newContext();const login=await other.request.post(runtime.base+'/api/auth/login',{headers:{origin:runtime.base},data:{email:'bob@example.invalid',password:'fixture-password-only'}});assert.equal(login.status(),200);
  assert.deepEqual(await (await other.request.get(runtime.base+'/api/mayorista/solicitudes')).json(),[]);assert.equal((await other.request.get(runtime.base+'/api/mayorista/solicitudes/'+rows[0].id)).status(),404);
  const bob=await (await other.request.get(runtime.base+'/api/mayorista/perfil?user_id='+runtime.users.alice.id)).json();assert.equal(bob.buyer.nombre,'Bruno Local');check('Cuenta B no puede leer solicitudes ni perfil de A');await other.close();
  const staleCookies=await context.cookies();await post('/api/auth/logout',{});assert.equal((await get('/api/mayorista/catalogo')).status(),401);
  const stolen=await browser.newContext();await stolen.addCookies(staleCookies);assert.equal((await stolen.request.get(runtime.base+'/api/mayorista/catalogo')).status(),401);await stolen.close();await page.reload();await page.waitForURL('**/mi-cuenta?volver=mayorista');check('Logout invalida cookies copiadas y acceso directo');
  await page.locator('#register-tab').click();await page.locator('#signin [name=nombre]').fill('Registro Local '+width);await page.locator('#signin [name=email]').fill('new-'+width+'@example.invalid');await page.locator('#signin [name=password]').fill('fixture-password-only');await page.locator('#signin [name=confirmacion]').fill('fixture-password-only');await page.locator('#signin-submit').click();await page.locator('#register-success').waitFor();
  assert.ok(runtime.lastConfirmation.url.includes('volver=mayorista'));await page.screenshot({path:evidence+'/email-confirmation-'+width+'.png',fullPage:true});await page.goto(runtime.lastConfirmation.url);await page.waitForURL('**/mayorista');await page.waitForFunction(()=>document.querySelectorAll('.wholesale-product').length===11);check('Registro + confirmación de correo → catálogo (Auth fixture local)');
  await context.close();
  // A late profile response must not replace the buyer's manual values.
  const late=await browser.newContext({viewport:{width,height:900}}),latePage=await late.newPage();latePage.on('pageerror',error=>report.errors.push(error.message));
  await late.request.post(runtime.base+'/api/auth/login',{headers:{origin:runtime.base},data:{email:'alice@example.invalid',password:'fixture-password-only'}});
  let release;const waiting=new Promise(resolve=>release=resolve);
  await latePage.route('**/api/mayorista/perfil',async route=>{const response=await route.fetch();await waiting;await route.fulfill({response});});
  await latePage.goto(runtime.base+'/mayorista');await latePage.waitForFunction(()=>document.querySelectorAll('.wholesale-product').length===11);
  await latePage.locator('[data-variant="700006"] input').fill('10');await latePage.locator('[data-variant="700006"] button').click();await latePage.locator('#wholesale-continue').click();
  await latePage.locator('[name=nombre]').fill('Manual antes de respuesta');await latePage.locator('[name=email]').fill('manual@example.invalid');release();await latePage.waitForFunction(()=>document.querySelector('#wholesale-profile-status').textContent.startsWith('Datos de tu cuenta'));
  assert.equal(await latePage.locator('[name=nombre]').inputValue(),'Manual antes de respuesta');assert.equal(await latePage.locator('[name=email]').inputValue(),'manual@example.invalid');check('Respuesta asíncrona respeta cambios manuales');await late.close();
 }
 assert.equal(runtime.db.query("select jsonb_build_object('profile',(select jsonb_agg(to_jsonb(p) order by id) from public.perfil p),'address',(select jsonb_agg(to_jsonb(d) order by id) from public.direccion d),'stock',(select jsonb_agg(to_jsonb(s) order by id_producto) from public.producto_simple s),'orders',(select count(*) from public.pedido),'payments',(select count(*) from public.pago));"),baseline);
 assert.equal(runtime.db.query('select count(*) from private.wholesale_request;'),'2');assert.equal(report.errors.length,0);report.permanentProfileAndRetailUnchanged=true;
}finally{fs.writeFileSync(evidence+'/browser-result.json',JSON.stringify(report,null,2));await browser.close();await runtime.close();}
console.log('PASS '+report.cases.length+' wholesale account Chrome cases, desktop/mobile, isolated PostgreSQL, profile/retail baseline unchanged');
