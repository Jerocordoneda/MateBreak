// Real-browser check of the cart page: "Volver" returns to Home and every item
// shows its product photo (the variant's own photo when it has one). The API is
// stubbed with synthetic data; nothing remote is used.
//   node scripts/verify-cart-photo.mjs [--dist] [--proof <dir>]
// Playwright: installed module, or MATEBREAK_BROWSER_MODULE=<path to playwright index.mjs>.
import http from 'node:http';
import assert from 'node:assert/strict';
import {readFile, stat, mkdir} from 'node:fs/promises';
import {extname, join, normalize, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const repo = resolve(import.meta.dirname, '..');
const root = resolve(repo, process.argv.includes('--dist') ? 'dist' : '.');
const proof = process.argv.includes('--proof') ? process.argv[process.argv.indexOf('--proof') + 1] : null;
if (proof) await mkdir(proof, {recursive: true});
const {chromium} = await import(process.env.MATEBREAK_BROWSER_MODULE
  ? pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href : 'playwright');
const rules = JSON.parse(await readFile(join(repo, 'vercel.json'), 'utf8')).rewrites
  .filter(rule => rule.destination.startsWith('/'))
  .map(rule => ({pattern: new RegExp('^' + rule.source.replace(/:[a-z]+\*?/g, '[^/]+') + '$'), to: rule.destination}));
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2'};
const server = http.createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') path = '/index.html';
  path = rules.find(rule => rule.pattern.test(path))?.to ?? path;
  try {
    const file = join(root, normalize(path));
    if ((await stat(file)).isDirectory()) throw new Error('dir');
    res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

// Local images stand in for catalogue photos (served by the same origin).
const photo = name => `${origin}/src/assets/images/frames-mate1/${name}`;
const simple = {id_producto: 11, slug: 'bombilla-de-prueba', nombre: 'BOMBILLA DE PRUEBA', imagen_principal: photo('ezgif-frame-001-removebg-preview.webp'), categorias: [], destacado: false, disponible: true, precio: 1000};
const withVariants = {id_producto: 12, slug: 'mate-de-prueba', nombre: 'MATE DE PRUEBA', imagen_principal: photo('ezgif-frame-060-removebg-preview.webp'), categorias: [], destacado: false, disponible: true, precio: 2000,
  variantes: [{id: 77, imagen: photo('ezgif-frame-030-removebg-preview-convertido-de-png.webp'), opciones: {Color: 'Negro'}}]};
const cart = {estado: 'activo', moneda: 'ARS', total: 5000, cotizacion: null, items: [
  {producto_id: '11', variante_id: null, nombre: simple.nombre, opciones: null, personalizacion: null, cantidad: 1, precio: 1000, moneda: 'ARS', activo: true, subtotal: 1000},
  {producto_id: '12', variante_id: '77', nombre: withVariants.nombre, opciones: {Color: 'Negro'}, personalizacion: '', cantidad: 2, precio: 2000, moneda: 'ARS', activo: true, subtotal: 4000},
  {producto_id: '99', variante_id: null, nombre: 'PRODUCTO SIN FICHA', opciones: null, personalizacion: null, cantidad: 1, precio: 0, moneda: 'ARS', activo: true, subtotal: 0}]};

const failures = [];
const check = async (name, fn) => { try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); } };
const browser = await chromium.launch({channel: process.env.MATEBREAK_BROWSER_CHANNEL || 'chrome', headless: true});
for (const [name, viewport, mobile] of [['desktop', {width: 1440, height: 900}, false], ['mobile', {width: 390, height: 844}, true]]) {
  for (const catalogue of ['ok', 'down']) {
    const context = await browser.newContext({viewport, isMobile: mobile, hasTouch: mobile});
    await context.route(/\/api\//, route => route.fulfill({status: 200, json: {}}));
    await context.route(/\/api\/sesion/, route => route.fulfill({json: {usuario: null}}));
    await context.route(/\/api\/metodos/, route => route.fulfill({json: {pagos: [], envios: []}}));
    await context.route(/\/api\/carrito(\?|$)/, route => route.fulfill({json: cart}));
    await context.route(/\/api\/carrito\/resumen/, route => route.fulfill({json: {cantidad: 4}}));
    await context.route(/\/api\/productos/, route => {
      if (catalogue === 'down') return route.fulfill({status: 503, json: {error: 'down'}});
      const url = new URL(route.request().url());
      if (url.pathname === '/api/productos') return route.fulfill({json: [simple, withVariants]});
      return route.fulfill({json: url.pathname.endsWith(withVariants.slug) ? withVariants : simple});
    });
    await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/carrito', {waitUntil: 'load'});
    await page.locator('#items .cart-item').first().waitFor();
    await page.waitForTimeout(1200);
    const label = `${name} catalogue ${catalogue}`;
    const items = await page.evaluate(() => [...document.querySelectorAll('#items .cart-item')].map(row => {
      const img = row.querySelector('.product-symbol img');
      return {name: row.querySelector('h3').textContent, src: img?.currentSrc || null, alt: img?.getAttribute('alt'),
        loaded: !!img && img.complete && img.naturalWidth > 0, icon: !!row.querySelector('.product-symbol svg')};
    }));
    await check(`${label} no page errors`, () => assert.deepEqual(errors, []));
    if (catalogue === 'ok') await check(`${label} photos: product, the variant's own, and the icon when there is none`, () => {
      const byName = Object.fromEntries(items.map(i => [i.name, i]));
      assert.equal(byName[simple.nombre].src, simple.imagen_principal);
      assert.equal(byName[withVariants.nombre].src, withVariants.variantes[0].imagen);
      for (const i of [byName[simple.nombre], byName[withVariants.nombre]]) { assert.ok(i.loaded); assert.equal(i.alt, ''); }
      assert.equal(byName['PRODUCTO SIN FICHA'].src, null); assert.ok(byName['PRODUCTO SIN FICHA'].icon);
    });
    else await check(`${label} without the catalogue every item keeps its icon`, () => assert.ok(items.every(i => i.src === null && i.icon)));
    if (proof && catalogue === 'ok') await page.screenshot({path: join(proof, `carrito-${name}.png`)});
    await check(`${label} "Volver" goes to Home`, async () => {
      const back = page.locator('a.mb-back-link');
      assert.equal(await back.getAttribute('href'), '/');
      assert.equal(await back.getAttribute('aria-label'), 'Volver al inicio');
      await Promise.all([page.waitForURL(origin + '/'), back.click()]);
    });
    await context.close();
  }
}
await browser.close(); server.close();
if (failures.length) { console.error(`${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('Cart: photos and "Volver" to Home pass (desktop/mobile, catalogue up/down)');
