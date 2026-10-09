import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {load} from 'cheerio';
const root=new URL('../',import.meta.url);
const pages=['index.html',...readdirSync(new URL('src/pages/',root)).filter(f=>f.endsWith('.html')).map(f=>'src/pages/'+f)];

test('every rendered page has functional account/cart navigation and CSS before JavaScript',()=>{
 for(const file of pages){
  const $=load(readFileSync(new URL(file,root),'utf8'));
  if($('meta[http-equiv="refresh"]').length)continue;
  assert.equal($('[data-cart-link]').length,1,file);
  assert.equal($('[data-account-link]').length,1,file);
  assert.equal($('[data-cart-link]').attr('href'),'/carrito',file);
  assert.equal($('[data-account-link]').attr('href'),'/mi-cuenta',file);
  assert.equal($('[data-cart-link] [data-cart-badge]').length,1,file);
  assert.equal($('head link[href="/src/css/header-account.css"]').length,1,file);
  assert.equal($('script[src="/src/js/header-account.js"][type="module"]').length,1,file);
  assert.equal($('header a[href="#"]').filter((i,e)=>$(e).text().includes('shopping_cart')).length,0,file);
  for(const e of $('[data-page-brand]').toArray())assert.equal($(e).find('img').length,1,file);
 }
});

test('header state entrypoint cannot build navigation and fade/account/cart entries do not initialize it again',()=>{
 const state=readFileSync(new URL('src/js/header-account.js',root),'utf8');
 assert.doesNotMatch(state,/createElement|replaceChildren|innerHTML|\.href\s*=|\.append\(|\.after\(/);
 for(const file of ['src/js/header-fade.js','src/features/account/account.js','src/features/cart/commerce.js'])
  assert.doesNotMatch(readFileSync(new URL(file,root),'utf8'),/import[^\n]*header-account/);
});
