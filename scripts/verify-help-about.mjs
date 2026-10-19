// Real-browser check of Ayuda and Nosotros: shared header, layout without
// horizontal scroll, local photos, the help search and the topic links, with and
// without reduced motion. The API is stubbed; nothing remote is used.
//   node scripts/verify-help-about.mjs [--dist] [--proof <dir>]
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

const failures = [];
const check = async (name, fn) => { try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); } };
const browser = await chromium.launch({channel: process.env.MATEBREAK_BROWSER_CHANNEL || 'chrome', headless: true});
const widths = [320, 390, 768, 1024, 1440, 1920];
for (const width of widths) for (const motion of ['no-preference', 'reduce']) for (const name of ['ayuda', 'nosotros']) {
  const mobile = width < 768;
  const context = await browser.newContext({viewport: {width, height: mobile ? 844 : 900}, isMobile: mobile, hasTouch: mobile, reducedMotion: motion});
  await context.route(/\/api\//, route => route.fulfill({status: 200, json: {}}));
  await context.route(/\/api\/sesion/, route => route.fulfill({json: {usuario: null}}));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  await context.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value; }).observe({type: 'layout-shift', buffered: true});
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/src/pages/${name}.html`, {waitUntil: 'networkidle'});
  await page.waitForTimeout(900);
  const label = `${name} ${width}/${motion}`;
  const state = await page.evaluate(() => {
    const header = document.querySelector('header.mb-public-header'), h1 = document.querySelector('h1'), style = getComputedStyle(h1);
    return {errorsFree: true, overflow: document.documentElement.scrollWidth - innerWidth, header: !!header, headerBottom: header?.getBoundingClientRect().bottom,
      current: [...document.querySelectorAll('.mb-help-nav a[aria-current="page"]')].map(a => a.textContent.trim()),
      ayudaHref: document.querySelector('.mb-help-nav a')?.getAttribute('href'),
      h1: h1.textContent.trim(), h1Font: style.fontFamily, h1Weight: style.fontWeight, h1Case: style.textTransform, h1Classes: h1.className,
      images: [...document.images].map(img => ({src: img.currentSrc, ok: img.complete && img.naturalWidth > 0})),
      footer: [...document.querySelectorAll('.mb-info-footer a')].map(a => a.getAttribute('href')), cls: window.__cls};
  });
  await check(`${label} no page errors`, () => assert.deepEqual(errors, []));
  await check(`${label} no horizontal scroll`, () => assert.ok(state.overflow <= 0, `overflow ${state.overflow}px`));
  await check(`${label} shared header marks this page`, () => {
    assert.ok(state.header); assert.equal(state.ayudaHref, '/src/pages/ayuda.html');
    assert.deepEqual(state.current, [name === 'ayuda' ? 'AYUDA' : 'NOSOTROS']);
  });
  await check(`${label} every image loads from this site`, () => {
    for (const image of state.images) { assert.ok(image.ok, image.src); assert.ok(image.src.startsWith(origin), image.src); }
  });
  await check(`${label} footer links`, () => assert.ok(['/src/pages/ayuda.html', '/src/pages/faqs.html', '/tienda', '/src/pages/nosotros.html', 'https://wa.me/542266487305'].every(href => state.footer.includes(href))));
  await check(`${label} layout shift stays negligible`, () => assert.ok(state.cls < 0.05, `CLS ${state.cls}`));
  if (name === 'nosotros') await check(`${label} title and typography kept`, () => {
    assert.equal(state.h1, 'Somos MateBreak®');
    assert.match(state.h1Classes, /^font-display-lg text-display-lg text-on-surface uppercase tracking-tighter /);
    assert.match(state.h1Font, /Geist/); assert.equal(state.h1Case, 'uppercase'); assert.equal(state.h1Weight, '700');
  });
  if (name === 'ayuda') {
    await check(`${label} search filters, ignores accents and recovers`, async () => {
      const input = page.locator('#help-query');
      assert.ok(await input.isVisible());
      const visible = () => page.evaluate(() => [...document.querySelectorAll('details.mb-faq')].filter(d => d.offsetParent).map(d => ({q: d.querySelector('summary').textContent, open: d.open})));
      assert.equal((await visible()).length, 12);
      await input.fill('transferencia');
      let shown = await visible();
      assert.deepEqual(shown.map(s => s.q), ['¿Qué medios de pago aceptan?', '¿Cómo funciona el pago por transferencia?']);
      assert.ok(shown.every(s => s.open));
      assert.equal(await page.locator('[data-help-status]').textContent(), '2 respuestas encontradas');
      await input.fill('envio pais');
      assert.deepEqual((await visible()).map(s => s.q), ['¿Hacen envíos a todo el país?']);
      await input.fill('zzzz');
      assert.equal((await visible()).length, 0);
      assert.ok(await page.locator('[data-help-empty]').isVisible());
      await page.locator('[data-help-reset]').click();
      shown = await visible();
      assert.equal(shown.length, 12); assert.ok(shown.every(s => !s.open));
      assert.equal(await input.inputValue(), '');
    });
    await check(`${label} topic links land below the header`, async () => {
      await page.locator('a.mb-info-card[href="#pagos"]').click();
      await page.waitForTimeout(motion === 'reduce' ? 200 : 900);
      const top = await page.evaluate(() => document.getElementById('pagos').getBoundingClientRect().top);
      assert.ok(top >= state.headerBottom - 1 && top < state.headerBottom + 80, `group top ${top}, header ${state.headerBottom}`);
    });
    await page.evaluate(() => scrollTo(0, 0));
  }
  if (proof && motion === 'no-preference' && [390, 1440].includes(width)) await page.screenshot({path: join(proof, `${name}-${width}.png`), fullPage: true});
  await context.close();
}
await browser.close(); server.close();
if (failures.length) { console.error(`${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log(`Ayuda and Nosotros: all checks passed (${widths.length} widths × motion on/off)`);
