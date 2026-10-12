// Browser QA uses real catalogue reads. Cart writes are intercepted in this
// test context only, so verification never changes a remote cart or inventory.
const {chromium}=await import('playwright').catch(()=>import(process.env.MB_PLAYWRIGHT_MODULE||'file:///C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
const out='outputs/demo-polish';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={layouts:[],interactions:[],errors:[]};
try {
 const cache='outputs/demo-catalog-local.json';
 const catalog=existsSync(cache)?JSON.parse(readFileSync(cache,'utf8').replace(/^\uFEFF/,'')):await (await fetch('http://localhost:3000/api/productos')).json();
 const single=catalog.find(p=>!p.opciones.length&&!p.atributos?.personalizable_explicitamente&&p.variantes.length===1&&p.variantes[0].comprable&&p.variantes[0].con_stock);
 assert.ok(single,'Real catalogue needs a directly purchasable product');
 const customized=catalog.find(p=>p.opciones.length&&/crea-tu-diseno/.test(p.slug));
 for(const width of [320,360,375,390,414,430,768,1024,1280,1440,1920]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:width<768,hasTouch:width<768});
  await context.route('**/api/productos',route=>route.fulfill({json:catalog}));
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push({width,error:e.message}));
  for(const path of ['/','/tienda','/productos/'+single.slug,'/productos/'+customized.slug,'/carrito','/checkout']) {
   await page.goto('http://localhost:3000'+path);await page.evaluate(()=>document.fonts.ready);
   if(path==='/tienda')await page.locator('.catalog-card').first().waitFor();
   if(path.startsWith('/productos'))await page.locator('.product-info').waitFor();
   const dimensions=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
   assert.ok(dimensions.scroll<=dimensions.client+1,JSON.stringify({width,path,...dimensions}));report.layouts.push({width,path,...dimensions});
   if(path==='/'&&[320,768,1024,1920].includes(width))await page.screenshot({path:`${out}/responsive-${width}.png`});
  }
  await page.goto('http://localhost:3000/');await page.locator('[data-seq-img][role=slider]').waitFor();
  const img=page.locator('[data-seq-img]');await img.scrollIntoViewIfNeeded();await img.focus();
  await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('[data-seq-img]').src.includes('frame-001'));
  if(width===390||width===1440){
   const box=await img.boundingBox();
   if(width===390){
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.2,y:box.y+box.height*.5}]});
    for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width*(.2+step*.06),y:box.y+box.height*.5}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{
    await page.mouse.move(box.x+box.width*.2,box.y+box.height*.5);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.8,box.y+box.height*.5,{steps:12});await page.mouse.up();
   }
   await page.waitForFunction(()=>!document.querySelector('[data-seq-img]').src.includes('frame-001'));
   await page.screenshot({path:`${out}/mate-drag-${width}.png`});report.interactions.push({width,pointer:'passed'});
  }
  await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('[data-seq-img]').src.includes('frame-060'));
  // Sample just before/after the curved edge crosses the real header centre,
  // then reverse direction. Re-evaluate geometry after each scroll paint.
  const transitionY=await page.locator('.matebreak-transition').evaluate(el=>el.getBoundingClientRect().top+scrollY);
  for(const offset of [0,150,300,450,300,150,0]){
   await page.evaluate(y=>scrollTo(0,y),transitionY-150+offset);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const theme=await page.evaluate(()=>{
    const h=document.querySelector('header'),t=document.querySelector('.matebreak-transition'),c=document.querySelector('.matebreak-curve'),r=h.getBoundingClientRect();
    return {expected:Math.max(t.getBoundingClientRect().top,c.getBoundingClientRect().top)<=r.top+r.height/2,actual:h.classList.contains('header-dark')};
   });assert.equal(theme.actual,theme.expected,JSON.stringify({width,offset,theme}));
  }
  await page.evaluate(y=>scrollTo(0,y),transitionY+300);await page.waitForFunction(()=>document.querySelector('header').classList.contains('header-dark'));
  if(width===390||width===1440)await page.screenshot({path:`${out}/header-light-${width}.png`});
  if(width<768)await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();
  const toggle=page.getByRole('button',{name:'Subcategorías de Mates',exact:true});await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  const menu=page.locator('.mb-subnav-open .dropdown-menu');assert.ok(await menu.isVisible());
  const menuBox=await menu.boundingBox();assert.ok(menuBox.x>=0&&menuBox.x+menuBox.width<=width+1,JSON.stringify({width,menuBox}));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width===390||width===1440)await page.screenshot({path:`${out}/menu-${width}.png`});
  await page.keyboard.press('Escape');
  if(width>=768){await toggle.focus();await page.keyboard.press('ArrowDown');assert.ok(await menu.locator('a').first().evaluate(el=>el===document.activeElement));await page.keyboard.press('Escape');}
  report.interactions.push({width,keyboard:true,theme:true,menu:true});await context.close();
 }
 for(const signedIn of [false,true]){
  const page=await browser.newPage({viewport:{width:390,height:900}});let quantity=0,writes=0;
  await page.route('**/api/productos',route=>route.fulfill({json:catalog}));
  await page.route('**/api/sesion',route=>route.fulfill({json:{usuario:signedIn?{id:'browser-test-user',email:'qa@example.invalid'}:null}}));
  await page.route('**/api/carrito',route=>route.fulfill({json:{items:quantity?[{variante_id:single.variantes[0].id,cantidad:quantity}]:[]}}));
  await page.route('**/api/carrito/variantes/*',async route=>{
   writes++;quantity=route.request().postDataJSON().cantidad;
   await new Promise(resolve=>setTimeout(resolve,150));
   await route.fulfill({json:{items:[{variante_id:single.variantes[0].id,cantidad:quantity}]}});
  });
  await page.goto('http://localhost:3000/tienda');
  const card=page.locator('.catalog-card').filter({has:page.locator(`a[href="/productos/${single.slug}"]`)}),plus=card.locator('.catalog-add');
  await plus.waitFor();await plus.evaluate(button=>{button.click();button.click();});
  await card.getByText('Agregado al carrito',{exact:true}).waitFor();assert.equal(writes,1);assert.equal(quantity,1);assert.ok(page.url().endsWith('/tienda'));
  assert.equal(await page.locator('[data-cart-badge]').textContent(),'1');
  await plus.click();await page.waitForFunction(()=>document.querySelector('[data-cart-badge]').textContent==='2');assert.equal(quantity,2);
  await page.route('**/api/carrito/variantes/*',route=>route.fulfill({status:409,json:{error:'Stock insuficiente'}}));
  await plus.click();await card.getByText('Stock insuficiente',{exact:true}).waitFor();assert.equal(await plus.isEnabled(),true);assert.equal(await page.locator('[data-cart-badge]').textContent(),'2');
  await card.locator('.catalog-title').click();await page.waitForURL('**/productos/'+single.slug);
  await page.goto('http://localhost:3000/tienda');
  await page.locator('.catalog-card').filter({has:page.locator(`a[href="/productos/${customized.slug}"]`)}).locator('.catalog-add').click();
  await page.waitForURL('**/productos/'+customized.slug);await page.locator('.product-options select').first().waitFor();assert.equal(writes,2);
  report.interactions.push({signedIn,cartContract:true,doubleClickGuard:true,customization:true});await page.close();
 }
 const reduced=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 await reduced.goto('http://localhost:3000/');assert.equal(await reduced.locator('[data-seq-img]').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.equal(await reduced.locator('.mb-collection-badge').evaluate(el=>el.tagName),'DIV');await reduced.close();
 assert.deepEqual(report.errors,[]);console.log(`PASS ${report.layouts.length} layouts; ${report.interactions.length} interaction groups; no JS errors`);
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{writeFileSync(`${out}/browser-report.json`,JSON.stringify(report,null,2));await browser.close();}
