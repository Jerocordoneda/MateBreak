// Real-browser check that the Home golden wave never lingers when the visitor
// scrolls back up: with Motion on, the displayed amplitude may trail the scroll by
// at most WAVE_SLACK of progress (home-motion.js), so a tall mountain is never left
// in the middle of a phone screen. Rising (scrolling down) keeps its soft spring.
//   node scripts/verify-wave-reverse.mjs [--dist]
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

const failures = [];
const check = async (name, fn) => { try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); } };
const browser = await chromium.launch({channel: process.env.MATEBREAK_BROWSER_CHANNEL || 'chrome', headless: true});
for (const [width, height, mobile] of [[320, 700, true], [360, 740, true], [390, 844, true], [1440, 900, false]]) {
  for (const speed of [28, 12]) {   // px per frame: a quick flick and an ordinary drag
    const label = `${width}x${height} ${speed}px/frame`;
    const context = await browser.newContext({viewport: {width, height}, isMobile: mobile, hasTouch: mobile});
    await context.route(/\/api\//, route => route.fulfill({json: []}));
    await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/', {waitUntil: 'load'});
    await page.waitForTimeout(1200);
    const motion = await page.evaluate(() => document.documentElement.hasAttribute('data-mb-home-motion'));
    await page.evaluate(() => {
      // Static amplitude for a progress, mirroring script.js (start/finish, smoothstep).
      const curve = document.querySelector('.matebreak-curve'), t = document.querySelector('.matebreak-transition');
      const staticAmp = (progress, h) => {
        const phone = innerWidth <= 760, cm = 96 / 2.54;
        const start = (.22 * innerHeight + (phone ? 3.5 * cm : 0)) / (innerHeight + h);
        const finish = Math.max(start + .2, innerHeight * .82 / (innerHeight + h));
        const phase = Math.max(0, Math.min(1, (progress - start) / (finish - start)));
        return .015 + .985 * phase * phase * (3 - 2 * phase);
      };
      window.__rows = []; window.__phase = 'idle';
      const tick = () => {
        const r = t.getBoundingClientRect();
        const raw = Math.max(0, Math.min(1, (innerHeight - r.top) / (innerHeight + r.height)));
        window.__rows.push({phase: window.__phase, raw, amp: Number(curve.dataset.waveAmplitude || 0),
          allowed: staticAmp(Math.min(1, raw + .03), r.height), lower: staticAmp(raw, r.height)});
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const geo = await page.evaluate(() => { const r = document.querySelector('.matebreak-transition').getBoundingClientRect(); return {top: r.top + scrollY, h: r.height}; });
    const from = Math.max(0, Math.round(geo.top - height * 1.1)), to = Math.round(geo.top + geo.h * .6);
    const swipe = async (a, z) => { const step = a < z ? speed : -speed; for (let y = a; step > 0 ? y < z : y > z; y += step) { await page.evaluate(v => scrollTo(0, v), y); await page.waitForTimeout(16); } };
    await page.evaluate(v => scrollTo(0, v), from); await page.waitForTimeout(500);
    await page.evaluate(() => { window.__phase = 'down'; }); await swipe(from, to); await page.waitForTimeout(900);
    await page.evaluate(() => { window.__phase = 'up'; }); await swipe(to, from); await page.waitForTimeout(1000);
    const rows = await page.evaluate(() => window.__rows);
    await check(`${label} Motion active and no page errors`, () => { assert.ok(motion); assert.deepEqual(errors, []); });
    await check(`${label} scrolling back the wave never lingers above the page`, () => {
      const up = rows.filter(r => r.phase === 'up');
      const worst = up.reduce((m, r) => Math.max(m, r.amp - r.allowed), -1);
      assert.ok(worst <= .02, `amplitude exceeded the scroll by ${worst.toFixed(3)}`);
      assert.ok(up.at(-1).amp <= .016, `final amplitude ${up.at(-1).amp}`);
    });
    await check(`${label} the rise keeps its soft spring (trails the scroll, reaches full)`, () => {
      const down = rows.filter(r => r.phase === 'down');
      assert.ok(down.some(r => r.amp < r.lower - .05), 'the rise no longer trails the scroll');
      assert.ok(down.at(-1).amp >= .99, `rise ended at ${down.at(-1).amp}`);
    });
    await context.close();
  }
}
await browser.close(); server.close();
if (failures.length) { console.error(`${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('Wave reverse: never lingers when scrolling back; rise keeps its spring (320-1440 px, flick and drag)');
