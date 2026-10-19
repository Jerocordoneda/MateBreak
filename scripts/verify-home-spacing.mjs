// Real-browser check of the Home spacing between the Instagram call, the video
// carousel and the FAQ; also that the carousel box never clips its cards.
//   node scripts/verify-home-spacing.mjs [--dist]
// Playwright: installed module, or MATEBREAK_BROWSER_MODULE=<path to playwright index.mjs>.
import http from 'node:http';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {extname, join, normalize, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '..', process.argv.includes('--dist') ? 'dist' : '.');
const {chromium} = await import(process.env.MATEBREAK_BROWSER_MODULE
  ? pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href : 'playwright');
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4'};
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    const file = join(root, normalize(path === '/' ? '/index.html' : path));
    if ((await stat(file)).isDirectory()) throw new Error('dir');
    res.writeHead(200, {'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store'});
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel: process.env.MATEBREAK_BROWSER_CHANNEL || 'chrome', headless: true});
const failures = [];
for (const [width, height] of [[320, 700], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]]) {
  const mobile = width < 768;
  const context = await browser.newContext({viewport: {width, height}, isMobile: mobile, hasTouch: mobile});
  await context.route(/\/api\//, route => route.fulfill({status: 200, json: []}));
  await context.route(/fonts\.(googleapis|gstatic)\.com|youtube/, route => route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/', {waitUntil: 'load'}); await page.waitForTimeout(1000);
  const g = await page.evaluate(() => {
    const button = [...document.querySelectorAll('a')].find(a => a.textContent.includes('@matebreak_oficial')).getBoundingClientRect();
    const mount = document.querySelector('[data-video-carousel]'), box = mount.getBoundingClientRect();
    const cards = [...mount.querySelectorAll('.vc-card')].map(c => c.getBoundingClientRect()).filter(r => r.width > 0);
    const top = Math.min(...cards.map(r => r.top)), bottom = Math.max(...cards.map(r => r.bottom));
    const faq = [...document.querySelectorAll('h2')].find(e => e.textContent.includes('Preguntas Frecuentes')).getBoundingClientRect();
    return {instagram: top - button.bottom, faq: faq.top - bottom, slack: box.height - (bottom - top), overflow: document.documentElement.scrollWidth - innerWidth};
  });
  const check = (name, ok) => { if (!ok) failures.push(`${width}px ${name}: ${JSON.stringify(g)}`); };
  check('Instagram call to videos is close', g.instagram >= 20 && g.instagram <= 50);
  check('videos to FAQ is close', g.faq >= 48 && g.faq <= 120);
  check('carousel box fits the hover zoom without an empty band', g.slack >= 12 && g.slack <= 40);
  check('no errors or overflow', !errors.length && g.overflow <= 0);
  if (!mobile) {
    // Hovering the active card zooms it; it must stay inside the box (overflow hidden).
    await page.evaluate(() => document.querySelector('[data-video-carousel]').scrollIntoView({block: 'center'}));
    const box = await page.locator('[data-video-carousel]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(900);
    const fit = await page.evaluate(() => {
      const m = document.querySelector('[data-video-carousel]').getBoundingClientRect();
      return [...document.querySelectorAll('[data-video-carousel] .vc-card')].map(c => c.getBoundingClientRect()).filter(r => r.width > 0)
        .every(r => r.top >= m.top - .5 && r.bottom <= m.bottom + .5);
    });
    check('hovered card stays inside the box', fit);
  }
  await context.close();
}
await browser.close(); server.close();
if (failures.length) { console.error(`${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('Home spacing: all checks passed (6 widths)');
