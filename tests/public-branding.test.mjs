import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {load}from'cheerio';
const root=new URL('../',import.meta.url),logo='/src/assets/email/matebreak-logo.png';
test('every public HTML has the official local favicon and MateBreak title; brand images are local',()=>{
 const pages=['index.html',...fs.readdirSync(new URL('src/pages/',root)).filter(n=>n.endsWith('.html')).map(n=>'src/pages/'+n)];
 assert.ok(fs.statSync(new URL(logo.slice(1),root)).size>0);
 for(const file of pages){const text=fs.readFileSync(new URL(file,root),'utf8'),$=load(text);assert.match($('title').text(),/MateBreak/i,file);assert.equal($('link[rel=icon]').length,1,file);assert.equal($('link[rel=icon]').attr('href'),logo,file);
 $('.mb-brand-link img,.mb-site-brand img').each((_,el)=>assert.equal($(el).attr('src'),logo,file));assert.ok(!/Coddlex/i.test(text),file);
 // Legacy aliases redirect immediately to the branded catalog rather than render a page.
 assert.ok($('.mb-brand-link,.mb-site-brand').length||$('script[src="/src/js/header-account.js"]').length||$('meta[http-equiv=refresh]').length,file+' must mount shared branding or redirect');
 }
});
