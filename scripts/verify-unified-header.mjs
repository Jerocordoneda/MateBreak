// Real-browser check of the shared header and SEO titles on every route.
// Serves the repository (or dist/ with --dist) applying vercel.json's local
// rewrites; the API is stubbed with a synthetic product, so nothing remote is used.
//   node scripts/verify-unified-header.mjs [--dist]
// Playwright: installed module, or MATEBREAK_BROWSER_MODULE=<path to playwright index.mjs>.
import http from 'node:http';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, normalize, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pages, HOME_TITLE, pageTitle} from './seo-pages.mjs';

const repo = resolve(import.meta.dirname, '..');
const root = resolve(repo, process.argv.includes('--dist') ? 'dist' : '.');
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

const product = {id_producto: 1, nombre: 'MATE DE PRUEBA', slug: 'mate-de-prueba', descripcion: 'Mate sintético solo para la verificación del header.',
  precio: 1000, precio_original: 1000, precio_transferencia: 900, moneda: 'ARS', tipo: 'simple', activo: true, publicado: true, disponible: true,
  destacado: false, cuotas: null, atributos: {}, descuento: 0, envio_gratis: false, personalizacion: null, categorias: [], opciones: [],
  variantes: [{id_variante: 1, nombre: 'Único', precio: 1000, comprable: true, con_stock: true, atributos: {}}], imagenes: [], imagen_principal: null, promociones: [], componentes: []};
const routeFile = {'/': 'index.html', '/tienda': 'src/pages/catalogo.html', '/carrito': 'src/pages/tienda.html', '/checkout': 'src/pages/checkout.html',
  '/checkout/resultado': 'src/pages/checkout-resultado.html', '/mi-cuenta': 'src/pages/cuenta.html', '/mayorista': 'src/pages/mayorista.html',
  '/regalos-empresariales': 'src/pages/regalos-empresariales.html', '/recuperar-cuenta': 'src/pages/recuperar-cuenta.html', '/podcast': 'src/pages/podcast.html'};
// producto.html is only reached through /productos/:slug (checked below).
for (const file of Object.keys(pages)) if (file.startsWith('src/pages/') && file !== 'src/pages/producto.html' && !Object.values(routeFile).includes(file)) routeFile['/' + file] = file;
const redirects = new Set(['src/pages/algarrobo-clasico.html', 'src/pages/camionero-premium.html']);
const expectedTitle = route => route === '/productos/mate-de-prueba' ? pageTitle(product.nombre)
  : routeFile[route] === 'index.html' ? HOME_TITLE : pageTitle(pages[routeFile[route]].name);

const failures = [];
const check = async (name, fn) => { try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); } };
const browser = await chromium.launch({channel: process.env.MATEBREAK_BROWSER_CHANNEL || 'chrome', headless: true});

async function open(viewport, mobile) {
  const context = await browser.newContext({viewport, isMobile: mobile, hasTouch: mobile});
  await context.route(/\/api\//, route => route.fulfill({status: 200, json: []}));
  await context.route(/\/api\/productos/, route => route.fulfill({json: route.request().url().includes('/api/productos/') ? product : [product]}));
  await context.route(/\/api\/carrito\/resumen/, route => route.fulfill({json: {cantidad: 0}}));
  await context.route(/fonts\.(googleapis|gstatic)\.com|youtube/, route => route.abort());
  return context;
}
const headerState = page => page.evaluate(() => {
  const headers = document.querySelectorAll('header.mb-public-header'), header = headers[0];
  if (!header) return {count: 0};
  const visible = element => element && element.getBoundingClientRect().width > 0 && getComputedStyle(element).display !== 'none';
  return {count: headers.length, height: Math.round(header.querySelector('.mb-public-mainbar').getBoundingClientRect().height),
    nav: [...header.querySelectorAll('.mb-category-nav a, .mb-help-nav a')].map(a => a.getAttribute('href')).join(' '),
    actions: [...header.querySelectorAll('.mb-public-actions > *')].filter(visible).map(e => e.className.split(' ')[0]).join(','),
    image: getComputedStyle(header).backgroundImage, overflow: document.documentElement.scrollWidth - innerWidth};
});

for (const [name, viewport, mobile] of [['desktop', {width: 1440, height: 900}, false], ['mobile', {width: 390, height: 844}, true]]) {
  const context = await open(viewport, mobile);
  let reference;
  for (const route of ['/podcast', ...Object.keys(routeFile).filter(r => r !== '/podcast'), '/productos/mate-de-prueba']) {
    const label = `${name} ${route}`, page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + route, {waitUntil: 'load'});
    await page.waitForTimeout(redirects.has(routeFile[route]) ? 1500 : 700);
    const state = await headerState(page);
    if (redirects.has(routeFile[route])) {
      await check(`${label} redirects to the catalogue keeping its header`, () => { assert.match(page.url(), /\/tienda\?q=/); assert.equal(state.count, 1); });
      await page.close(); continue;
    }
    reference ??= state;
    await check(`${label} title`, async () => assert.equal(await page.title(), expectedTitle(route)));
    await check(`${label} one shared header identical to Podcast`, () => {
      assert.equal(state.count, 1); assert.equal(state.height, mobile ? 64 : 80);
      assert.equal(state.nav, reference.nav); assert.equal(state.actions, reference.actions);
    });
    await check(`${label} surface`, () => route === '/'
      ? assert.equal(state.image, 'none', 'Home keeps its own surface')
      : assert.match(state.image, /^linear-gradient\(rgba\(\d+, \d+, \d+, 0\.94\)/));
    await check(`${label} no errors or horizontal overflow`, () => { assert.deepEqual(errors, []); assert.ok(state.overflow <= 0, `overflow ${state.overflow}`); });
    await page.close();
  }
  // Navigation through the shared header, with real clicks.
  const page = await context.newPage();
  const targets = mobile ? ['Mates', 'Compra Mayorista', 'Podcast'] : ['Mates', 'Termos', 'Sets Premium', 'Accesorios', 'Compra Mayorista', 'Podcast', 'NOSOTROS'];
  for (const text of targets) await check(`${name} navigation "${text}"`, async () => {
    await page.goto(origin + '/tienda', {waitUntil: 'load'}); await page.waitForTimeout(400);
    if (mobile) { await page.getByRole('button', {name: 'Abrir navegación'}).click(); assert.equal(await page.getByRole('button', {name: 'Cerrar navegación'}).getAttribute('aria-expanded'), 'true'); }
    const link = page.locator('header.mb-public-header').getByRole('link', {name: text, exact: false}).first();
    const href = await link.getAttribute('href');
    await Promise.all([page.waitForURL(url => url.pathname === new URL(href, origin).pathname), link.click()]);
    assert.equal((await headerState(page)).count, 1);
  });
  await check(`${name} brand returns Home`, async () => {
    await page.goto(origin + '/tienda', {waitUntil: 'load'});
    await Promise.all([page.waitForURL(origin + '/'), page.getByRole('link', {name: 'MateBreak, inicio'}).click()]);
  });
  await check(`${name} search dialog opens and closes`, async () => {
    await page.goto(origin + '/mi-cuenta', {waitUntil: 'load'});
    await page.getByRole('button', {name: 'Buscar productos'}).click();
    await page.getByRole('dialog').waitFor({timeout: 5000}); await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({state: 'hidden', timeout: 5000});
  });
  if (mobile) await check('mobile menu closes with Escape and returns focus', async () => {
    await page.goto(origin + '/checkout', {waitUntil: 'load'});
    const toggle = page.getByRole('button', {name: 'Abrir navegación'}); await toggle.click(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('.mb-menu-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('mb-menu-toggle')), true);
  });
  else await check('desktop keyboard: header links are reachable with a visible focus ring', async () => {
    await page.goto(origin + '/carrito', {waitUntil: 'load'});
    const seen = [];
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); seen.push(await page.evaluate(() => { const e = document.activeElement, s = getComputedStyle(e); return {inHeader: !!e.closest('header.mb-public-header'), ring: s.outlineStyle !== 'none'}; })); }
    assert.ok(seen.filter(s => s.inHeader).length >= 4, 'header links in tab order'); assert.ok(seen.filter(s => s.inHeader).every(s => s.ring), 'focus ring');
  });
  await context.close();
}

await browser.close(); server.close();
if (failures.length) { console.error(`${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log(`Unified header and titles: all checks passed (${Object.keys(routeFile).length + 1} routes × desktop/mobile)`);
