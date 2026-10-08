// Isolated presentation regression: no Cloud connections or commercial writes.
// MATEBREAK_BROWSER_MODULE points to an installed Playwright module (no extra runtime dependency).
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import express from 'express';
import {load} from 'cheerio';
const {chromium} = await import(pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href);
const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.MATEBREAK_HEADER_PROOF;
assert.ok(output, 'Provide an evidence directory outside the repository');
fs.mkdirSync(output, {recursive:true});
const baseline = process.argv.includes('--baseline');
const source = process.argv.includes('--dist') ? path.join(root, 'dist') : root;
const files = ['index.html', ...fs.readdirSync(path.join(root, 'src/pages')).filter(f => f.endsWith('.html')).map(f => 'src/pages/'+f)]
  .filter(f => fs.readFileSync(path.join(root,f),'utf8').includes('/src/js/header-account.js'));
const app = express();
app.get('/api/sesion', (_,res) => res.json({usuario:null}));
app.get('/api/carrito/resumen', (_,res) => res.json({cantidad:3}));
app.get('/api/carrito', (_,res) => res.json({items:[], resumen:{subtotal:0,total:0}}));
app.get('/api/*path', (_,res) => res.json([]));
app.use('/api', (_,res) => res.sendStatus(405));
app.use(express.static(source, {dotfiles:'allow'}));
const server = app.listen(0,'127.0.0.1');
const browser = await chromium.launch({channel:'chrome',headless:true});
const report = {baseline, files, cases:[], errors:[], navigation:[]};
try {
 for (const width of [1440,1024,768,390,360]) {
  const ctx = await browser.newContext({viewport:{width,height:900}});
  const page = await ctx.newPage();
  page.on('pageerror', e => report.errors.push({page:page.url(),error:e.message}));
  for (const file of files) {
   await page.goto(`http://127.0.0.1:${server.address().port}/`+file, {waitUntil:'domcontentloaded'});
   await page.evaluate(() => document.fonts.ready);
   await page.locator('[data-cart-badge]').first().waitFor({state:'attached'});
   await page.evaluate(() => window.dispatchEvent(new CustomEvent('mb:cart',{detail:3})));
   const measured = await page.evaluate(() => {
    const rect = e => {if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    const brand = document.querySelector('.mb-public-header .mb-public-brand,.mb-brand-link,.mb-site-brand,header .brand');
    const cart = document.querySelector('[data-cart-link]'), account = document.querySelector('[data-account-link]');
    return {logo:rect(brand?.querySelector('img')),brand:rect(brand),cart:rect(cart),account:rect(account),bar:rect(document.querySelector('.mb-public-mainbar')),
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      brandCount:document.querySelectorAll('.mb-public-brand').length,
      badge:cart?.querySelector('[data-cart-badge]')?.textContent,
      cartHref:cart?.getAttribute('href'),accountHref:account?.getAttribute('href'),
      name:account?.getAttribute('aria-label'),image:brand?.querySelector('img')?.getAttribute('src'),
      extras:[...document.querySelectorAll('.mb-public-extras > *')].map(e=>({class:e.className,...rect(e),box:getComputedStyle(e).boxSizing,padding:getComputedStyle(e).padding,border:getComputedStyle(e).borderWidth})),
      padding:document.querySelector('.mb-public-mainbar')&&getComputedStyle(document.querySelector('.mb-public-mainbar')).padding};
   });
   report.cases.push({file,width,...measured});
   await page.screenshot({path:path.join(output,(baseline?'before':'after')+'-'+width+'-'+path.basename(file,'.html')+'.png'),clip:{x:0,y:0,width,height:180}});
   if(!baseline) {
    const original=load(fs.readFileSync(path.join(root,file),'utf8'));
    const navigationHrefs=original('header a,.mb-header-actions a').map((_,e)=>original(e).attr('href')).get();
    const remainingHrefs=await page.locator('a[href]').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
    for(const href of new Set(navigationHrefs))assert.ok(remainingHrefs.filter(h=>h===href).length>=navigationHrefs.filter(h=>h===href).length,file+' lost navigation '+href);
    assert.equal(await page.evaluate(async()=>{const {mountPublicHeader}=await import('/src/js/public-header.mjs');const cart=document.querySelector('[data-cart-link]'),account=document.querySelector('[data-account-link]');mountPublicHeader();mountPublicHeader();return document.querySelector('[data-cart-link]')===cart&&document.querySelector('[data-account-link]')===account;}),true,'Idempotent mount preserves original action nodes');
    const reference=report.cases.find(c=>c.width===width);
    for(const key of ['logo','brand','cart','account','bar'])assert.deepEqual(measured[key],reference[key],`${file} ${width}: ${key}`);
    assert.equal(measured.brandCount,1,file);assert.equal(measured.overflow,false,file+' overflow '+width);
    assert.equal(measured.badge,'3');assert.equal(measured.cartHref,'/carrito');assert.equal(measured.accountHref,'/mi-cuenta');
    assert.equal(measured.image,'/src/assets/email/matebreak-logo.png');assert.ok(measured.name);
    assert.ok(measured.cart.width>=44&&measured.account.width>=44);
    assert.equal(await page.locator('[data-account-link]').innerText(),'','Account is icon only');
    assert.equal(measured.account.x+measured.account.width,width-measured.logo.x,'Account at right content edge');
    assert.ok(measured.brand.x+measured.brand.width<=measured.cart.x, 'No brand/actions overlap');
    assert.equal(await page.locator('.order-summary,.checkout-order,.wholesale-summary').evaluateAll(es=>es.every(e=>getComputedStyle(e).position!=='sticky'||parseFloat(getComputedStyle(e).top)>=document.querySelector('.mb-public-mainbar').offsetHeight)),true,'Sticky summaries remain below the primary bar');
    await page.locator('[data-account-link]').focus();
    assert.notEqual(await page.locator('[data-account-link]').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('mb:cart',{detail:12})));
    assert.equal(await page.locator('[data-cart-badge]').first().textContent(),'12');
   }
  }
  if(!baseline) {
   await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
   await page.locator('.mb-public-header').waitFor();
   if(width<=760) {
    await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();
    await page.getByRole('button',{name:'Subcategorías de Mates',exact:true}).click();
    await page.getByRole('button',{name:'Subcategorías de Termos',exact:true}).click();
    assert.equal(await page.locator('.mb-subnav-open').count(),1);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button',{name:'Abrir navegación',exact:true}).getAttribute('aria-expanded'),'false');
   }
   await page.mouse.wheel(0,500);
   assert.equal(await page.locator('.mb-public-mainbar').evaluate(e=>e.getBoundingClientRect().y),0);
   report.navigation.push({width,pass:true});
  }
  await ctx.close();
 }
 if(!baseline)assert.deepEqual(report.errors,[]);
 console.log(`PASS ${report.cases.length} header measurements; ${report.navigation.length} navigation/scroll checks`);
} catch(e) {report.failure=e.message;process.exitCode=1;console.error(e.message);}
finally {fs.writeFileSync(path.join(output,baseline?'before.json':'after.json'),JSON.stringify(report,null,2));await browser.close();server.close();}
