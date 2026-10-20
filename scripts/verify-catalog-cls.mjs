// Real-browser check that the catalogue never shifts while products load: the
// skeleton is there from the first frame, products replace it in place, and the
// empty and error states keep the controls where they were. The API is stubbed
// with synthetic products and a configurable delay; nothing remote is used.
//   node scripts/verify-catalog-cls.mjs [--dist]
// Playwright: installed module, or MATEBREAK_BROWSER_MODULE=<path to playwright index.mjs>.
import http from 'node:http';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, normalize, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const repo = resolve(import.meta.dirname, '..');
const root = resolve(repo, process.argv.includes('--dist') ? 'dist' : '.');
const {chromium} = await import(process.env.MATEBREAK_BROWSER_MODULE
  ? pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href : 'playwright');
const rules = JSON.parse(await readFile(join(repo, 'vercel.json'), 'utf8')).rewrites
  .filter(rule => rule.destination.startsWith('/'))
  .map(rule => ({pattern: new RegExp('^' + rule.source.replace(/:[a-z]+\*?/g, '[^/]+') + '$'), to: rule.destination}));
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4'};
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

// Synthetic catalogue: local photos, two categories, most with a crossed-out price (as on Staging).
const frame = n => `/src/assets/images/frames-mate1/ezgif-frame-0${String(n).padStart(2, '0')}-removebg-preview${n > 1 && n <= 47 ? '-convertido-de-png' : ''}.webp`;
const products = Array.from({length: 18}, (_, i) => ({
  id_producto: 100 + i, slug: `producto-${i}`, nombre: `${i % 3 ? 'MATE DE ALGARROBO' : 'TERMO'} DE PRUEBA ${i}`, descripcion: 'Pieza de prueba para medir el catálogo sin red real.',
  imagen_principal: frame((i % 50) + 1), categorias: [{slug: i % 3 ? 'mates' : 'termos', nombre: i % 3 ? 'Mates' : 'Termos'}],
  destacado: i < 6, disponible: true, precio: 20000 + i * 1000, precio_original: i % 3 === 2 ? null : 26000 + i * 1000, moneda: 'ARS'}));

const failures = [];
const check = async (name, fn) => { try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); } };
const browser = await chromium.launch({channel: process.env.MATEBREAK_BROWSER_CHANNEL || 'chrome', headless: true});

async function open(path, {width, delay = 0, answer = 'ok', blockModules = false}) {
  const mobile = width < 768;
  const context = await browser.newContext({viewport: {width, height: mobile ? 844 : 900}, isMobile: mobile, hasTouch: mobile});
  const state = {answer};
  await context.route(/\/api\//, route => route.fulfill({json: {}}));
  await context.route(/\/api\/sesion/, route => route.fulfill({json: {usuario: null}}));
  await context.route(/\/api\/productos(\?|$)/, async route => {
    await new Promise(done => setTimeout(done, delay));
    if (state.answer === 'error') return route.fulfill({status: 503, json: {error: 'No pudimos cargar el catálogo.'}});
    return route.fulfill({json: state.answer === 'empty' ? [] : products});
  });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  if (blockModules) await context.route(/catalog-pages\.js/, route => route.abort());
  await context.addInitScript(() => {
    window.__cls = 0; window.__shifts = [];
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push(e.value); } })
      .observe({type: 'layout-shift', buffered: true});
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + path, {waitUntil: 'domcontentloaded'});
  return {context, page, errors, state};
}
const settled = page => page.waitForFunction(() => { const c = document.querySelector('[data-catalog]'); return c && !c.hasAttribute('aria-busy') && !c.querySelector('.catalog-card-skeleton'); }, null, {timeout: 15000});

for (const width of [320, 390, 768, 1024, 1440]) {
  for (const delay of [0, 1500]) {
    const label = `/tienda ${width}px api ${delay}ms`;
    const {context, page, errors} = await open('/tienda', {width, delay});
    await check(`${label} skeleton fills the grid before the API answers`, async () => {
      if (!delay) return;
      const first = await page.evaluate(() => ({busy: document.querySelector('[data-catalog]').getAttribute('aria-busy'), cards: document.querySelectorAll('.catalog-card-skeleton').length,
        hidden: [...document.querySelectorAll('.catalog-card-skeleton')].every(c => c.getAttribute('aria-hidden') === 'true'), controls: !!document.querySelector('.catalog-controls input')}));
      assert.deepEqual(first, {busy: 'true', cards: 6, hidden: true, controls: true});
      await page.locator('.catalog-controls input').fill('termo');
    });
    await settled(page);
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({cls: window.__cls, shifts: window.__shifts, cards: document.querySelectorAll('.catalog-card:not(.catalog-card-skeleton)').length,
      options: document.querySelector('.catalog-controls select').options.length, disabled: document.querySelector('.catalog-controls select').disabled,
      search: document.querySelector('.catalog-controls input').value, overflow: document.documentElement.scrollWidth - innerWidth}));
    await check(`${label} no page errors`, () => assert.deepEqual(errors, []));
    await check(`${label} CLS stays under 0.05`, () => assert.ok(after.cls < 0.05, `CLS ${after.cls.toFixed(4)} (${after.shifts.map(s => s.toFixed(4)).join(', ')})`));
    await check(`${label} products, categories and the typed search are in place`, () => {
      assert.equal(after.options, 3); assert.equal(after.disabled, false); assert.equal(after.overflow <= 0, true);
      if (delay) { assert.equal(after.search, 'termo'); assert.equal(after.cards, 6); } else assert.equal(after.cards, 18);
    });
    await context.close();
  }
}

await check('/tienda first paint already has the skeleton (before any script runs)', async () => {
  const {context, page} = await open('/tienda', {width: 390, blockModules: true});
  await page.waitForLoadState('load');
  assert.equal(await page.locator('[data-catalog] .catalog-card-skeleton').count(), 6);
  assert.equal(await page.locator('[data-catalog]').getAttribute('aria-busy'), 'true');
  await context.close();
});

for (const width of [390, 1440]) {
  await check(`/tienda ${width}px empty catalogue says so without shifting the controls`, async () => {
    const {context, page} = await open('/tienda', {width, delay: 800, answer: 'empty'});
    await page.locator('.catalog-controls').waitFor();
    const before = await page.locator('.catalog-controls').boundingBox();
    await settled(page);
    await page.getByText('Todavía no hay productos en el catálogo.').waitFor();
    assert.deepEqual(await page.locator('.catalog-controls').boundingBox(), before);
    await context.close();
  });
  await check(`/tienda ${width}px API error shows an alert and the retry recovers`, async () => {
    const {context, page, state} = await open('/tienda', {width, delay: 800, answer: 'error'});
    await page.locator('.catalog-controls').waitFor();
    const before = await page.locator('.catalog-controls').boundingBox();
    const alert = page.getByRole('alert');
    await alert.waitFor();
    assert.match(await alert.textContent(), /No pudimos cargar el catálogo|503|catálogo/i);
    assert.deepEqual(await page.locator('.catalog-controls').boundingBox(), before);
    assert.equal(await page.locator('[data-catalog]').getAttribute('aria-busy'), null);
    state.answer = 'ok';
    await page.getByRole('button', {name: 'Reintentar'}).click();
    await settled(page);
    assert.equal(await page.locator('.catalog-card:not(.catalog-card-skeleton)').count(), 18);
    await context.close();
  });
}

for (const [path, label] of [['/src/pages/algarrobo.html', 'category page'], ['/', 'Home featured']]) {
  for (const width of [390, 1440]) {
    await check(`${label} ${width}px loads its cards in place`, async () => {
      const {context, page, errors} = await open(path, {width, delay: 1200});
      await page.locator('[data-catalog] .catalog-card-skeleton').first().waitFor({state: 'attached'});
      await settled(page);
      assert.ok(await page.locator('[data-catalog] .catalog-card').count() > 0);
      assert.deepEqual(errors, []);
      await context.close();
    });
  }
}

await browser.close(); server.close();
if (failures.length) { console.error(`${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('Catalogue: CLS under 0.05 with API delays, skeleton from first paint, empty/error/retry states (320-1440 px)');
