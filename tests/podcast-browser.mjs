// Real local Express routes, no API interception or media-provider fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {localStatus} from '../scripts/local-test-runtime.mjs';
import {responsiveViewports,inspectResponsiveLayout,assertResponsiveLayout} from './responsive-layout-checks.mjs';
const {chromium}=await import(process.env.MATEBREAK_PLAYWRIGHT_MODULE||'playwright');
assert.equal(localStatus().API_URL,'http://127.0.0.1:54321');
const origin='http://localhost:3000',out=path.resolve(process.env.MATEBREAK_EVIDENCE_DIR||'');
assert.ok(process.env.MATEBREAK_EVIDENCE_DIR&&!out.toLowerCase().startsWith(path.resolve(import.meta.dirname,'..').toLowerCase()));
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={kind:'REAL LOCAL',interceptions:false,cases:[],errors:[],api500:[],externalMedia:[]};
try{
 const context=await browser.newContext(),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(new URL(r.url()).pathname.startsWith('/api/')&&r.status()>=500)report.api500.push(r.status());});
 page.on('request',r=>{if(/spotify|youtube|resend|mercadopago|micorreo/i.test(r.url()))report.externalMedia.push(r.url());});
 for(const [width,height] of [...responsiveViewports,[844,390]]){
  await page.setViewportSize({width,height});await page.goto(origin+'/');await page.evaluate(()=>document.fonts.ready);
  const link=page.getByRole('link',{name:'Podcast de MateBreak',exact:true});assert.equal(await link.count(),1);
  const bounds=await link.boundingBox();assert.ok(bounds.width>=44&&bounds.height>=44);
  const overlaps=await page.locator('.mb-header-actions > a,.mb-header-actions > button').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect()).filter(r=>r.width&&r.height).some((a,i,all)=>all.some((b,j)=>i!==j&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)));
  const groupOverlap=await page.locator('.mb-mainbar > .mb-brand-link,.mb-mainbar > .mb-help-nav,.mb-mainbar > .mb-header-actions').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect()).filter(r=>r.width&&r.height).some((a,i,all)=>all.some((b,j)=>i!==j&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)));
  assert.equal(groupOverlap,false,'Brand, help navigation and actions must not overlap');
  assert.equal(overlaps,false);assertResponsiveLayout(await inspectResponsiveLayout({playwright:page}));
  await page.screenshot({path:path.join(out,`header-${width}x${height}.png`)});
  await link.focus();await page.keyboard.press('Enter');await page.waitForURL(origin+'/podcast');
  await page.getByRole('heading',{name:'Una pausa. Una buena charla.'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Podcast de MateBreak',exact:true}).getAttribute('aria-current'),'page');
  assert.equal(await page.locator('audio,video,iframe,input,form').count(),0);assert.equal(await page.locator('.podcast-episode').count(),12);assert.equal(await page.locator('.podcast-episode-link[href*="-wjfvhQcifk"]').count(),0);await page.getByRole('button',{name:'Cargar video del episodio 12',exact:true}).waitFor();
  assert.ok((await page.request.get(origin+'/podcast')).headers()['permissions-policy'].includes('microphone=()'));
  assertResponsiveLayout(await inspectResponsiveLayout({playwright:page}));
  await page.screenshot({path:path.join(out,`podcast-${width}x${height}.png`)});
  if(width===320){await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();await page.getByRole('button',{name:'Subcategorías de Mates',exact:true}).click();await page.getByRole('link',{name:'Algarrobo',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Abrir navegación',exact:true}).getAttribute('aria-expanded'),'false');}
  await page.getByRole('link',{name:'Más episodios',exact:true}).click();await page.getByRole('heading',{name:'Más episodios',exact:true}).waitFor();const title=await page.getByRole('heading',{name:'Más episodios',exact:true}).boundingBox();const header=await page.locator('.mb-commerce-header').boundingBox();assert.ok(title.y>=header.y+header.height,'Anchor title must stay below the fixed header');await page.screenshot({path:path.join(out,`episodes-${width}x${height}.png`)});
  report.cases.push({width,height,status:'PASS',keyboardNavigation:true,touchTarget44:true,headerOverlap:false,overflow:false,mediaElements:0});
 }
 for(const route of ['/podcast','/src/pages/podcast.html']){await page.goto(origin+route);assert.equal(await page.getByRole('heading',{name:'Una pausa. Una buena charla.'}).count(),1);await page.getByRole('link',{name:'Explorar la tienda'}).click();await page.waitForURL(origin+'/tienda');await page.locator('.catalog-card').first().waitFor();}
 const nojs=await browser.newContext({javaScriptEnabled:false}),p=await nojs.newPage();await p.goto(origin+'/');await p.getByRole('link',{name:'Podcast de MateBreak'}).click();await p.waitForURL(origin+'/podcast');assert.equal(await p.getByRole('heading',{name:'Más episodios',exact:true}).count(),1);await nojs.close();
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.api500,[]);assert.deepEqual(report.externalMedia,[]);
 console.log('PASS Podcast: nine viewports, real routes and keyboard navigation, static no-JS entry, no iframe or media SDK before explicit player activation; existing microphone=() policy unchanged');
}finally{fs.writeFileSync(path.join(out,'podcast-result.json'),JSON.stringify(report,null,2));await browser.close();}
