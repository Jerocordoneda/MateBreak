// Comparative browser evidence and isolated cart writes. Never uses a database.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import express from 'express';
import {productCardData} from '../server/modules/catalog/routes.mjs';
const {chromium}=await import(pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href);
const out=process.env.MATEBREAK_RECOVERY_PROOF,base=process.env.MATEBREAK_BASE_ROOT;
assert.ok(out&&base);fs.mkdirSync(out,{recursive:true});
const products=JSON.parse(fs.readFileSync(process.env.MATEBREAK_CATALOG_SNAPSHOT));
const reports=[],errors=[];
const browser=await chromium.launch({channel:'chrome',headless:true});
async function serve(root){
  const app=express(),writes=[];let items=[];
  app.use(express.json());
  app.get('/api/productos',(_,res)=>res.json(products.map(productCardData)));
  app.get('/api/productos/:slug',(req,res)=>{const p=products.find(p=>p.slug===req.params.slug);p?res.json(p):res.sendStatus(404);});
  app.get('/api/sesion',(_,res)=>res.json({usuario:null}));
  app.get('/api/carrito/resumen',(_,res)=>res.json({cantidad:items.reduce((n,i)=>n+i.cantidad,0)}));
  app.get('/api/carrito',(_,res)=>res.json({items,resumen:{subtotal:0,total:0}}));
  app.put('/api/carrito/variantes/:id',async(req,res)=>{
    writes.push({id:req.params.id,...req.body});await new Promise(r=>setTimeout(r,100));
    items=items.filter(i=>i.variante_id!==req.params.id);items.push({variante_id:req.params.id,...req.body});res.json({items});
  });
  app.use('/api',(_,res)=>res.sendStatus(405));
  for(const [url,file]of Object.entries({'/':'index.html','/tienda':'src/pages/catalogo.html','/carrito':'src/pages/carrito.html'}))app.get(url,(_,res)=>res.sendFile(path.join(root,file),{dotfiles:'allow'}));
  app.get('/productos/:slug',(_,res)=>res.sendFile(path.join(root,'src/pages/producto.html'),{dotfiles:'allow'}));
  app.use(express.static(root,{dotfiles:'allow'}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  return {server,writes,origin:'http://127.0.0.1:'+server.address().port};
}
const baseline=await serve(base),candidate=await serve(process.cwd());
const metrics=async()=>{
  const box=e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100);};
  const header=document.querySelector('header.mb-public-header'),mate=document.querySelector('[data-seq-img]');
  const canvas=document.createElement('canvas');canvas.width=mate.naturalWidth;canvas.height=mate.naturalHeight;
  const ctx=canvas.getContext('2d');ctx.drawImage(mate,0,0);
  const pixels=[...new Uint8Array(await crypto.subtle.digest('SHA-256',ctx.getImageData(0,0,canvas.width,canvas.height).data))].join(',');
  return {header:header.innerHTML,geometry:[...header.querySelectorAll('.mb-public-mainbar,.mb-public-brand,.mb-public-actions,.mb-search-toggle,.mb-cart-link,.mb-account-link,.mb-category-nav')].map(box),mate:box(mate),mateStyle:['width','height','objectFit','maxHeight'].map(k=>getComputedStyle(mate)[k]),frame:mate.getAttribute('src'),pixels};
};
try{
  for(const width of [320,360,390,768,1024,1440,1920]){
    const samples=[];
    for(const [label,service]of [['base',baseline],['candidate',candidate]]){
      const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(service.origin+'/');await page.locator('.mb-search-toggle').waitFor();await page.evaluate(()=>document.fonts.ready);
      // Freeze only the decorative float for deterministic comparisons, not sequence logic.
      await page.addStyleTag({content:'[data-seq-img]{animation:none!important}'});await page.waitForTimeout(1800);
      await page.waitForFunction(()=>document.querySelector('[data-seq-img]').complete);
      const measure=await page.evaluate(metrics);samples.push(measure);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      await page.screenshot({path:path.join(out,`${label}-hero-${width}.png`)});
      await page.locator('[data-seq-img]').screenshot({path:path.join(out,`${label}-mate-${width}.png`)});
      await page.locator('[data-home-actions]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${label}-actions-${width}.png`)});
      if(label==='base'){
        const y=await page.locator('.matebreak-transition').evaluate(e=>e.getBoundingClientRect().top+scrollY);await page.evaluate(y=>scrollTo(0,y-250),y);await page.waitForTimeout(150);await page.screenshot({path:path.join(out,`base-transition-${width}.png`)});
        await page.goto(service.origin+'/tienda');await page.locator('.catalog-card').first().waitFor();await page.locator('.catalog-card').first().evaluate(e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-160,behavior:'instant'}));await page.screenshot({path:path.join(out,`base-cards-${width}.png`)});
      }
      if(label==='candidate'){
        assert.equal(await page.locator('[data-home-actions] a').count(),1);assert.equal(await page.locator('a.mb-collection-badge').count(),0);
        assert.equal(await page.locator('.mb-collection-badge').count(),1);
        assert.equal(await page.locator('.mb-public-actions .mb-podcast-link').count(),0);assert.equal(await page.locator('.mb-account-link').innerText(),'');
        await page.getByRole('button',{name:'Buscar productos',exact:true}).click();await page.getByRole('searchbox',{name:'Buscar productos'}).fill('calabaza');await page.locator('.mb-search-results .catalog-card').first().waitFor();
        await page.screenshot({path:path.join(out,`search-${width}.png`)});await page.keyboard.press('Escape');
        const y=await page.locator('.matebreak-transition').evaluate(e=>e.getBoundingClientRect().top+scrollY);
        for(const offset of [-250,-60,100,300]){
          await page.evaluate(y=>scrollTo(0,y),y+offset);await page.waitForTimeout(100);
          const theme=await page.evaluate(()=>{const h=document.querySelector('header'),r=h.getBoundingClientRect(),t=document.querySelector('.matebreak-transition'),c=document.querySelector('.matebreak-curve');return {actual:h.classList.contains('header-dark'),expected:Math.max(t.getBoundingClientRect().top,c.getBoundingClientRect().top)<=r.top+r.height/2};});
          assert.equal(theme.actual,theme.expected);
          const background=await page.locator('header').evaluate(e=>getComputedStyle(e).backgroundImage);assert.ok(background.includes(theme.actual?'255, 255, 255':'23, 24, 21'));
          await page.screenshot({path:path.join(out,`transition-${width}-${offset}.png`)});
        }
        await page.screenshot({path:path.join(out,`transition-${width}.png`)});
        await page.goto(service.origin+'/tienda');await page.locator('.catalog-card').first().waitFor();await page.locator('.catalog-card').first().evaluate(e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-160,behavior:'instant'}));await page.screenshot({path:path.join(out,`cards-${width}.png`)});
        assert.equal(await page.locator('.catalog-price').first().evaluate(e=>getComputedStyle(e).color),'rgb(235, 187, 151)');
        assert.equal(await page.locator('.catalog-price').first().innerText().then(t=>t.includes('Desde')),false);
        const aligned=await page.locator('.catalog-card').evaluateAll(cards=>cards.every(e=>{const card=e.getBoundingClientRect(),image=e.querySelector('.catalog-image').getBoundingClientRect(),body=e.querySelector('.catalog-card-body').getBoundingClientRect(),footer=e.querySelector('.catalog-card-footer').getBoundingClientRect(),price=e.querySelector('.catalog-price').getBoundingClientRect(),action=e.querySelector('.catalog-card-action').getBoundingClientRect();return (innerWidth<=540?Math.abs(image.height-body.height)<1&&Math.abs(image.right-body.x)<1:Math.abs(image.width-body.width)<1&&image.x===body.x)&&action.y>=footer.y&&action.bottom<=footer.bottom+1&&price.right<=action.x+1&&action.right<=card.right;}));assert.ok(aligned);
        assert.equal(await page.locator('.catalog-results').evaluate(e=>e.getBoundingClientRect().width),1);
        if(width>760){await page.locator('.mb-category-nav .group').first().hover();const position=await page.locator('.mb-category-nav .group').first().evaluate(e=>{const link=e.getBoundingClientRect(),menu=e.querySelector('.dropdown-menu').getBoundingClientRect();return {shift:menu.x+menu.width/2-link.x-link.width/2,down:menu.y+parseFloat(getComputedStyle(e.querySelector('.dropdown-menu')).paddingTop)-link.bottom};});assert.equal(Math.round(position.shift),12);assert.equal(position.down,22);await page.screenshot({path:path.join(out,`submenu-${width}.png`)});}
      }
      await context.close();
    }
    // Cart quantities are allowed to differ across the two local servers.
    assert.deepEqual(samples[1].geometry,samples[0].geometry);assert.equal(samples[1].header,samples[0].header);
    assert.deepEqual(samples[1].mate,samples[0].mate);assert.deepEqual(samples[1].mateStyle,samples[0].mateStyle);assert.equal(samples[1].frame,samples[0].frame);
    assert.equal(samples[1].pixels,samples[0].pixels,'Decoded mate pixels differ');
    reports.push({width,headerIdentical:true,mateIdentical:true,search:true,transition:true,cards:true});
  }
  const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(candidate.origin+'/tienda');await page.locator('.catalog-card').first().waitFor();
  const simple=products.find(p=>p.disponible!==false&&!p.opciones.length&&p.variantes.length===1&&!p.atributos?.personalizable_explicitamente&&!/personaliz/i.test(p.nombre)&&p.variantes[0].con_stock&&p.variantes[0].comprable);
  const card=page.locator('.catalog-card').filter({has:page.locator('a.catalog-image[href="/productos/'+simple.slug+'"]')}),plus=card.locator('.catalog-card-action');
  await plus.evaluate(e=>{e.click();e.click();});await card.getByText('Agregado al carrito').waitFor();assert.equal(candidate.writes.length,1);assert.equal(candidate.writes[0].cantidad,1);
  await plus.click();await page.waitForFunction(()=>document.querySelector('[data-cart-badge]').textContent==='2');assert.equal(candidate.writes.length,2);assert.equal(candidate.writes[1].cantidad,2);
  const configurable=products.find(p=>p.opciones.length);await page.locator('.catalog-card').filter({has:page.locator('a.catalog-image[href="/productos/'+configurable.slug+'"]')}).locator('.catalog-card-action').click();await page.waitForURL('**/productos/'+configurable.slug);assert.equal(candidate.writes.length,2);
  const detailURL='**/api/productos/'+simple.slug;
  await page.route(detailURL,route=>route.fulfill({json:{...simple,variantes:[{...simple.variantes[0],con_stock:false}]}}));
  await page.goto(candidate.origin+'/tienda');await page.locator('.catalog-card').first().waitFor();
  await plus.click();await card.getByText('Producto no disponible para agregar.').waitFor();assert.equal(candidate.writes.length,2);
  await page.unroute(detailURL);
  await page.route(detailURL,route=>route.fulfill({json:{...simple,atributos:{...simple.atributos,personalizable_explicitamente:true}}}));
  await page.goto(candidate.origin+'/tienda');await page.locator('.catalog-card').first().waitFor();await plus.click();await page.waitForURL('**/productos/'+simple.slug);
  await page.locator('.product-options textarea').fill('Grabado para la demo');await page.getByRole('button',{name:'Agregar al carrito +',exact:true}).click();await page.getByText('Producto agregado. Tu selección está guardada.').waitFor();
  assert.equal(candidate.writes.length,3);assert.equal(candidate.writes[2].personalizacion,'Grabado para la demo');assert.equal(candidate.writes[2].cantidad,3);
  await page.unroute(detailURL);
  await page.goto(candidate.origin+'/tienda');await page.locator('.catalog-card').first().waitFor();await page.locator('.catalog-card-body').first().click({position:{x:3,y:3}});await page.waitForURL('**/productos/*');
  await context.close();assert.deepEqual(errors,[]);console.log('PASS seven comparative widths: identical header/mate, search, cards, submenu, transition; cart increments, double-click and canonical selection');
}finally{fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify({reports,errors,writes:candidate.writes},null,2));await browser.close();baseline.server.close();candidate.server.close();}

