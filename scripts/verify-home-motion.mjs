// Real-browser verification of the Home motion layer (mate, golden curve, header).
// Serves the repository (or dist/ with --dist) from a throwaway local server; the
// API is stubbed, so nothing touches Supabase, payments or any remote service.
//   node scripts/verify-home-motion.mjs [--dist]
// Playwright: installed module, or MATEBREAK_BROWSER_MODULE=<path to playwright index.mjs>.
// Evidence (screenshots, report.json) goes to MATEBREAK_MOTION_PROOF when set.
import http from 'node:http';
import assert from 'node:assert/strict';
import {readFile, stat, mkdir, writeFile} from 'node:fs/promises';
import {extname, join, normalize, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '..', process.argv.includes('--dist') ? 'dist' : '.');
const proof = process.env.MATEBREAK_MOTION_PROOF;
if (proof) await mkdir(proof, {recursive: true});
const {chromium} = await import(process.env.MATEBREAK_BROWSER_MODULE
  ? pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href : 'playwright');
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp4': 'video/mp4'};
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
const report = {origin, runs: []};
const failures = [];
const check = (name, fn) => { try { fn(); } catch (error) { failures.push(`${name}: ${error.message}`); } };

async function open({width, height, mobile = false, reduced = 'no-preference', blockMotion = false}) {
  const context = await browser.newContext({viewport: {width, height}, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced});
  await context.route(/\/api\//, route => route.fulfill({status: 200, json: []}));
  await context.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  if (blockMotion) await context.route(/vendor\/motion-/, route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__shift = 0;
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value; })
      .observe({type: 'layout-shift', buffered: true});
  });
  await page.goto(`${origin}/`, {waitUntil: 'load'});
  await page.waitForTimeout(1200);
  return {context, page, errors};
}

const sample = page => page.evaluate(() => {
  const img = document.querySelector('[data-seq-img]'), curve = document.querySelector('.matebreak-curve');
  const header = document.querySelector('header'), glint = document.querySelector('.mb-curve-glint');
  const pose = getComputedStyle(img.parentElement).transform;
  return {
    y: Math.round(scrollY),
    frame: Number((img.src.match(/frame-(\d+)/) || [])[1] || 0),
    pose: pose === 'none' ? null : pose.slice(7, -1).split(',').map(Number),
    move: parseFloat(getComputedStyle(curve).getPropertyValue('--curve-move')) || 0,
    apex: Math.round(curve.getBoundingClientRect().top),
    light: header.classList.contains('header-dark'),
    glint: glint ? (() => { const m = new DOMMatrix(getComputedStyle(glint).transform), cs = getComputedStyle(curve).borderTopLeftRadius.split(' ');
      const px = (v, size) => v.endsWith('%') ? parseFloat(v) / 100 * size : parseFloat(v);
      return {x: m.e + glint.offsetWidth / 2, y: m.f + glint.offsetHeight / 2, rx: px(cs[0], curve.offsetWidth), ry: px(cs[1] || cs[0], curve.offsetHeight)}; })() : null,
    floating: img.getAnimations().some(a => a.playState === 'running'),
    haloLayers: document.querySelectorAll('.mb-curve-halo,.mb-curve-glint').length,
    overflow: document.documentElement.scrollWidth - innerWidth,
    // Vertical corner radius over curve height: the arch must never flatten.
    arc: (() => { const v = getComputedStyle(curve).borderTopLeftRadius.split(' ')[1]; return v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / curve.offsetHeight; })()
  };
});

async function scrollThrough(page, {step = 90, wait = 28} = {}) {
  const total = await page.evaluate(() => document.querySelector('.matebreak-transition').getBoundingClientRect().bottom + scrollY - innerHeight * .1);
  const rows = [];
  for (let y = 0; y < total; y += step) { await page.mouse.wheel(0, step); await page.waitForTimeout(wait); rows.push(await sample(page)); }
  await page.waitForTimeout(700);
  rows.push(await sample(page));
  return rows;
}

// Per-frame continuity: no jumps while the visitor scrolls (mate pose, curve, header).
async function frameTrace(page, distance) {
  return page.evaluate(async total => {
    const img = document.querySelector('[data-seq-img]'), curve = document.querySelector('.matebreak-curve');
    const frames = []; let last = performance.now(), running = true;
    const tick = now => { frames.push({dt: now - last, pose: new DOMMatrix(getComputedStyle(img.parentElement).transform).f,
      apex: curve.getBoundingClientRect().top + scrollY}); last = now; if (running) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    let done = 0;
    while (done < total) { scrollBy(0, 45); done += 45; await new Promise(r => setTimeout(r, 16)); }
    await new Promise(r => setTimeout(r, 500)); running = false;
    const dts = frames.map(f => f.dt).slice(2).sort((a, b) => a - b);
    const jump = key => Math.max(...frames.slice(2).map((f, i) => Math.abs(f[key] - frames[i + 1][key])));
    return {frames: frames.length, p95: dts[Math.floor(dts.length * .95)], max: dts.at(-1), poseJump: jump('pose'), apexJump: jump('apex')};
  }, distance);
}

const viewports = [
  {name: 'desktop-1440', width: 1440, height: 900},
  {name: 'laptop-1024', width: 1024, height: 768},
  {name: 'tablet-768', width: 768, height: 1024, mobile: true},
  {name: 'mobile-390', width: 390, height: 844, mobile: true},
  {name: 'mobile-320', width: 320, height: 700, mobile: true}
];

for (const viewport of viewports) {
  for (const reduced of ['no-preference', 'reduce']) {
    const label = `${viewport.name}/${reduced}`;
    const {context, page, errors} = await open({...viewport, reduced});
    const first = await sample(page);
    const rows = await scrollThrough(page);
    const poses = new Set(rows.map(r => r.pose?.join()).filter(Boolean));
    const last = rows.at(-1), travel = await page.evaluate(() => document.querySelector('.matebreak-transition').offsetHeight * .65);
    const wide = viewport.width > 760;
    check(`${label} no page errors`, () => assert.deepEqual(errors, []));
    check(`${label} golden arc keeps its curvature`, () => assert.ok(rows.every(r => r.arc > .2 && Math.abs(r.arc - first.arc) < .005), `arc ratio ${first.arc} -> ${last.arc}`));
    check(`${label} no horizontal overflow`, () => assert.ok(rows.every(r => r.overflow <= 0), 'overflow'));
    check(`${label} header flips to light after the apex reaches it`, () => {
      assert.equal(first.light, false); assert.equal(last.light, true);
    });
    if (reduced === 'no-preference') {
      check(`${label} mate pose is scroll-linked`, () => assert.ok(poses.size >= 8, `distinct poses ${poses.size}`));
      check(`${label} curve rises its full travel without flattening`, () => assert.ok(Math.abs(last.move + travel) < 1.5, `${last.move} vs -${travel}`));
      check(`${label} halo and glint layers exist and float runs`, () => {
        assert.equal(first.haloLayers, 2);
        assert.ok(rows.some(r => r.floating) || first.floating, 'float animation never ran');
      });
      const glints = [];
      await page.evaluate(() => scrollTo(0, document.querySelector('.matebreak-transition').getBoundingClientRect().top + scrollY - innerHeight * .55));
      for (let i = 0; i < 6; i++) { glints.push((await sample(page)).glint); await page.waitForTimeout(700); }
      check(`${label} golden glint travels along the arc's own ellipse`, () => {
        assert.ok(new Set(glints.map(g => Math.round(g.x))).size >= 3, 'glint did not move');
        for (const g of glints) assert.ok(Math.abs(g.y - g.ry * (1 - Math.sqrt(Math.max(0, 1 - (g.x / g.rx) ** 2)))) < 2, `glint off the arc at x=${g.x}`);
      });
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(900);
      const trace = await frameTrace(page, 2600);
      report.runs.push({label, trace});
      check(`${label} no long frames or jumps while scrolling`, () => {
        assert.ok(trace.max < 250, `longest frame ${trace.max}ms`);
        assert.ok(trace.poseJump < 28, `pose jump ${trace.poseJump}px`);
        assert.ok(trace.apexJump < 30, `curve jump ${trace.apexJump}px (document space)`);
      });
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(1200);
      const home = await sample(page);
      check(`${label} reverse scroll returns to the opening state`, () => {
        assert.ok(home.move > -2, `curve ${home.move}`); assert.equal(home.light, false);
      });
      const shift = await page.evaluate(() => window.__shift);
      check(`${label} layout shift stays negligible`, () => assert.ok(shift < .03, `CLS ${shift}`));
      if (proof) {
        for (const [tag, fraction] of [['mate', .3], ['curve', .55]]) {
          await page.evaluate(([t, f]) => {
            const el = document.querySelector(t === 'mate' ? '[data-scroll-sequence]' : '.matebreak-transition');
            scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight * (t === 'mate' ? 0 : f) + (t === 'mate' ? el.offsetHeight * f : 0));
          }, [tag, fraction]);
          await page.waitForTimeout(900);
          await page.screenshot({path: join(proof, `${viewport.name}-${tag}.png`)});
        }
      }
    } else {
      check(`${label} reduced: no pose, halo, glint, float or curve travel`, () => {
        assert.ok(rows.every(r => r.pose === null && r.haloLayers === 0 && !r.floating && r.move === 0), 'motion leaked');
      });
      if (wide) check(`${label} reduced: scroll-driven photograph sequence still plays`, () => assert.equal(last.frame, 60));
    }
    report.runs.push({label, frames: [first.frame, last.frame], poses: poses.size, move: last.move});
    await context.close();
  }
}

// Reduced motion toggled while the page is open, then restored.
{
  const {context, page, errors} = await open({width: 1440, height: 900});
  assert.equal((await sample(page)).haloLayers, 2);
  await page.emulateMedia({reducedMotion: 'reduce'}); await page.waitForTimeout(400);
  const off = await sample(page);
  check('live reduced-motion switch removes every layer', () => {
    assert.equal(off.haloLayers, 0); assert.equal(off.pose, null); assert.equal(off.floating, false);
  });
  await page.emulateMedia({reducedMotion: 'no-preference'}); await page.waitForTimeout(600);
  const back = await sample(page);
  check('switching back rebuilds the layers exactly once', () => assert.equal(back.haloLayers, 2));
  check('live switch raised no errors', () => assert.deepEqual(errors, []));
  await context.close();
}

// Progressive enhancement: with Motion blocked the page keeps the previous behaviour.
for (const viewport of [viewports[0], viewports[3]]) {
  const {context, page, errors} = await open({...viewport, blockMotion: true});
  const rows = await scrollThrough(page);
  const last = rows.at(-1);
  check(`fallback ${viewport.name}: no errors and curve still rises`, () => {
    assert.deepEqual(errors.filter(e => !/Motion/.test(e)), []); assert.ok(last.move < -50, `curve ${last.move}`);
    assert.equal(last.light, true);
  });
  if (viewport.width > 760) check('fallback desktop: photograph sequence still plays', () => assert.equal(last.frame, 60));
  await context.close();
}

await browser.close(); server.close();
if (proof) await writeFile(join(proof, 'report.json'), JSON.stringify({report, failures}, null, 2));
for (const run of report.runs) console.log(JSON.stringify(run));
if (failures.length) { console.error(`\n${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('\nHome motion verification: all checks passed');
