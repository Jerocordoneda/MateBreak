// Real-browser check of the SEO/performance changes: robots.txt and sitemap.xml
// are served as files, the subset Material Symbols font still draws every icon as
// a glyph, and the Home photos are WebP.
//   node scripts/verify-seo-performance.mjs [--dist]   (or ORIGIN=<url> for a deployment)
// Playwright: installed module, or MATEBREAK_BROWSER_MODULE=<path to playwright index.mjs>.
// Google Fonts is reached for real: the check is about the icon subset it serves.
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
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4'};
let server, origin = process.env.ORIGIN;
if (!origin) {
  server = http.createServer(async (req, res) => {
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
  origin = `http://127.0.0.1:${server.address().port}`;
}

const failures = [];
const check = async (name, fn) => { try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); } };
await check('robots.txt is a text file with the sitemap', async () => {
  const res = await fetch(origin + '/robots.txt');
  assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/plain/);
  assert.match(await res.text(), /^Sitemap: https:\/\/matebreak\.com\.ar\/sitemap\.xml$/m);
});
await check('sitemap.xml is XML with 125 URLs', async () => {
  const res = await fetch(origin + '/sitemap.xml'), body = await res.text();
  assert.equal(res.status, 200); assert.match(body, /^<\?xml version="1\.0"/);
  assert.equal(body.match(/<loc>/g).length, 125);
});

const browser = await chromium.launch({channel: process.env.MATEBREAK_BROWSER_CHANNEL || 'chrome', headless: true});
for (const [name, viewport, mobile] of [['desktop', {width: 1440, height: 900}, false], ['mobile', {width: 390, height: 844}, true]]) {
  for (const path of ['/', '/regalos-empresariales', '/src/pages/faqs.html', '/src/pages/algarrobo.html']) {
    const context = await browser.newContext({viewport, isMobile: mobile, hasTouch: mobile});
    const page = await context.newPage(), errors = [], fonts = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (/fonts\.gstatic\.com/.test(response.url())) fonts.push(response); });
    await page.goto(origin + path, {waitUntil: 'networkidle'});
    await page.evaluate(() => document.fonts.ready);
    const label = `${name} ${path}`;
    await check(`${label} no page errors`, () => assert.deepEqual(errors, []));
    await check(`${label} icons draw as glyphs from the subset font`, async () => {
      const icons = await page.evaluate(() => [...document.querySelectorAll('.material-symbols-outlined')].filter(el => el.offsetParent)
        .map(el => ({name: el.textContent.trim(), width: el.getBoundingClientRect().width, size: parseFloat(getComputedStyle(el).fontSize)})));
      for (const icon of icons) assert.ok(icon.width <= icon.size * 1.5, `${icon.name} renders as text (${icon.width}px)`);
      assert.ok(await page.evaluate(() => document.fonts.check('24px "Material Symbols Outlined"', 'expand_more')));
      for (const font of fonts.filter(f => /materialsymbols|kit=/.test(f.url()))) assert.ok((await font.body()).length < 20000, 'icon font larger than the subset');
    });
    if (path === '/') await check(`${label} WebP photos load when reached`, async () => {
      const tiles = await page.evaluate(async () => {
        const imgs = [...document.querySelectorAll('img[src*="recortes/"]')];
        for (const img of imgs) { img.scrollIntoView({block: 'center'}); await new Promise(done => img.complete ? done() : img.addEventListener('load', done, {once: true})); }
        return imgs.map(img => ({src: img.currentSrc, ok: img.naturalWidth > 0}));
      });
      assert.equal(tiles.length, 4);
      for (const tile of tiles) { assert.match(tile.src, /\.webp$/); assert.ok(tile.ok, tile.src); }
    });
    await context.close();
  }
}
await browser.close(); server?.close();
if (failures.length) { console.error(`${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('SEO/performance: crawler files, icon subset and WebP photos pass (desktop/mobile)');
