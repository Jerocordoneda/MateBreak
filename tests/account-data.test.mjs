import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dateTime,filterRecords,saleTotals} from '../src/features/account/account-data.js';
import {brandLogo,brandMarkup} from '../src/js/site-brand.js';
test('account and cart have the home logo but no navigation header',async()=>{
 const home=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.ok(home.includes(brandLogo));assert.match(home,/<header\b/);
 for(const page of ['cuenta','tienda']){const html=await readFile(new URL(`../src/pages/${page}.html`,import.meta.url),'utf8');assert.doesNotMatch(html,/<header\b/);assert.ok(html.includes(brandMarkup));assert.match(html,/data-page-brand/);assert.ok(html.includes('/src/css/site-brand.css'));}
});
test('account and commerce styles share Geist and Inter, without old fonts',async()=>{for(const path of ['commerce','account']){const css=await readFile(new URL(`../src/css/${path}.css`,import.meta.url),'utf8');assert.doesNotMatch(css,/Manrope|DM Sans/);assert.match(css,/Geist/);}});
test('record filters handle accents and combine text with state',()=>{const data=[{nombre:'José Pérez',estado:'entregada'},{nombre:'Jose otra venta',estado:'por_grabar'}];assert.equal(filterRecords(data,'JOSE','entregada',r=>r.nombre).length,1);assert.equal(filterRecords(data,'sin coincidencias','',r=>r.nombre).length,0);assert.equal(data.length,2);});
test('seller totals use cents and count reserved pieces only for pending sales',()=>{assert.deepEqual(saleTotals([{total:'10.10',estado:'por_grabar',items:[{cantidad:2}]},{total:'20.20',estado:'entregada',items:[{cantidad:3}]}]),{cents:3030,units:5,reserved:2});});
test('missing or malformed dates never show Invalid Date',()=>{assert.equal(dateTime(null),'Sin registrar');assert.equal(dateTime('bad','Sin ingreso'),'Sin ingreso');assert.match(dateTime('2026-09-09T12:00:00Z'),/2026/);});
