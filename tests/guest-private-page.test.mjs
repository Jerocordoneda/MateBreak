import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {load} from 'cheerio';
test('private order document has no third-party scripts/resources, no-referrer policy and a self-only CSP',()=>{
 const $=load(readFileSync(new URL('../src/pages/pedido.html',import.meta.url),'utf8'));
 assert.equal($('meta[name="referrer"]').attr('content'),'no-referrer');assert.match($('meta[http-equiv="Content-Security-Policy"]').attr('content'),/connect-src 'self'/);
 for(const e of $('script[src],link[href],img[src]').toArray())assert.ok(($(e).attr('src')||$(e).attr('href')).startsWith('/src/'));
 assert.equal($('[name="password"]').length,0);
 const script=readFileSync(new URL('../src/features/orders/private-order.js',import.meta.url),'utf8');assert.ok(script.indexOf('history.replaceState')<script.indexOf('fetch('));assert.doesNotMatch(script,/localStorage|sessionStorage|document\.cookie|console\.|innerHTML/);
});
test('checkout initially contains delivery/payment controls and no compulsory Auth form',()=>{
 const $=load(readFileSync(new URL('../src/pages/checkout.html',import.meta.url),'utf8'));assert.equal($('input[type="password"],#checkout-login,#login-panel').length,0);assert.equal($('#recipient-form').length,1);assert.equal($('#place-order').length,1);
});
