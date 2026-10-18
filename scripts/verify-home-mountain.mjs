// Real-browser check of the Home mountain transition: spacing to the benefits,
// content clearance while the wave rises, crest/glow, spring settle, reversal,
// reduced motion and the Motion-less fallback. Serves the repository (or dist/
// with --dist) applying vercel.json's local rewrites; the API is stubbed.
//   node scripts/verify-home-mountain.mjs [--dist]
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
const browser = await chromium.launch({channel: process.env.MATEBREAK_BROWSER_CHANNEL || 'chrome', headless: true});
const failures = [];
const check = async (name, fn) => { try { await fn(); } catch (error) { failures.push(`${name}: ${error.message.split('\n')[0]}`); } };

async function open(width, {reduced = 'no-preference', blockMotion = false} = {}) {
  const mobile = width < 768, height = mobile ? 844 : 900;
  const context = await browser.newContext({viewport: {width, height}, isMobile: mobile, hasTouch: mobile, reducedMotion: reduced});
  await context.route(/\/api\//, route => route.fulfill({status: 200, json: []}));
  await context.route(/fonts\.(googleapis|gstatic)\.com|youtube/, route => route.abort());
  if (blockMotion) await context.route(/vendor\/motion-/, route => route.abort());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/', {waitUntil: 'load'});
  await page.waitForTimeout(900);
  return {context, page, errors, height};
}
// Bottom of the last visible benefits content above the transition, in document space.
const geometry = page => page.evaluate(() => {
  const t = document.querySelector('.matebreak-transition');
  const items = [...document.querySelectorAll('main *')].filter(e => (e.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING)
    && !t.contains(e) && e.children.length === 0 && e.getBoundingClientRect().height > 0 && (e.textContent.trim() || e.tagName === 'IMG'));
  return {top: t.getBoundingClientRect().top + scrollY, content: Math.max(...items.map(e => e.getBoundingClientRect().bottom + scrollY))};
});
const state = page => page.evaluate(() => {
  const curve = document.querySelector('.matebreak-curve'), header = document.querySelector('header');
  const transition = curve.closest('.matebreak-transition'), next = transition.nextElementSibling;
  const ridge = curve.querySelector('[data-curve-ridge]').getBoundingClientRect();
  return {amp: Number(curve.dataset.waveAmplitude || 1), spread: Number(curve.dataset.waveSpread || 1),
    crest: Number(curve.dataset.waveCrest || 1), layout: Number(curve.dataset.waveLayout || 1), lean: Number(curve.dataset.waveLean || 0),
    steepness: ridge.height / ridge.width, rise: ridge.height,
    cm: (() => { const probe = document.createElement('div'); probe.style.width = '1cm'; document.body.append(probe); const px = probe.getBoundingClientRect().width; probe.remove(); return px; })(),
    glow: Number(curve.querySelector('[data-ridge-glow]').getAttribute('opacity') ?? 1),
    apex: curve.querySelector('[data-curve-apex]').getBoundingClientRect().top, header: header.getBoundingClientRect().bottom,
    light: header.classList.contains('header-dark'), move: parseFloat(getComputedStyle(curve).getPropertyValue('--curve-move')) || 0,
    layers: document.querySelectorAll('.mb-curve-halo,.mb-curve-glint').length,
    join: next.getBoundingClientRect().top - transition.getBoundingClientRect().bottom,
    frame: Number((document.querySelector('[data-seq-img]').src.match(/frame-(\d+)/) || [])[1] || 0),
    overflow: document.documentElement.scrollWidth - innerWidth};
});

for (const width of [320, 390, 768, 1024, 1440, 1920]) {
  for (const mode of ['motion', 'fallback', 'reduced']) {
    const label = `${width}px ${mode}`;
    const {context, page, errors, height} = await open(width, {reduced: mode === 'reduced' ? 'reduce' : 'no-preference', blockMotion: mode === 'fallback'});
    const g = await geometry(page), gap = g.top - g.content, settle = mode === 'motion' ? 450 : 60;
    await check(`${label} sections are close (gap ${Math.round(gap)}px)`, () => assert.ok(gap >= 30 && gap <= 95, `gap ${gap}`));
    // Scroll down through the transition, then back up.
    const down = [], up = [];
    for (let y = g.top - height; y <= g.top + 40; y += 16) {
      await page.evaluate(y => scrollTo(0, y), y); await page.waitForTimeout(mode === 'motion' ? 120 : 30);
      down.push({y, contentY: g.content - y, boxY: g.top - y, ...(await state(page))});
    }
    await page.waitForTimeout(settle); const bottom = await state(page);
    for (let y = g.top + 40; y >= g.top - height; y -= 16) {
      await page.evaluate(y => scrollTo(0, y), y); await page.waitForTimeout(mode === 'motion' ? 120 : 30);
      up.push(await state(page));
    }
    await page.waitForTimeout(settle); const back = await state(page);
    const visible = down.filter(s => s.contentY > s.header);
    const clearance = Math.min(...visible.map(s => s.apex - s.contentY));
    await check(`${label} white apex never covers the benefits (min clearance ${Math.round(clearance)}px)`, () => assert.ok(clearance >= 8, `clearance ${clearance}`));
    await check(`${label} no errors, overflow or gap at the white join`, () => {
      assert.deepEqual(errors.filter(e => mode !== 'fallback' || !/Motion/.test(e)), []);
      assert.ok(down.every(s => s.overflow <= 0)); assert.ok(down.every(s => s.join <= .5), 'white join');
    });
    await check(`${label} header follows the rendered apex`, () => {
      // Sub-pixel ties at the exact contact line are not colour errors.
      for (const s of [...down, ...up]) if (Math.abs(s.apex - s.header) > 1) assert.equal(s.light, s.apex <= s.header, `apex ${s.apex} header ${s.header}`);
    });
    await check(`${label} mountain rises at most 8 cm on screen (${(bottom.rise / bottom.cm).toFixed(2)} cm)`, () => assert.ok(bottom.rise / bottom.cm <= 8.01, `${bottom.rise}px`));
    await check(`${label} mountain has phone proportions (steepness ${bottom.steepness.toFixed(3)})`, () => width === 320
      ? assert.ok(bottom.steepness >= .5, 'narrow phones stay at least as steep')
      : assert.ok(Math.abs(bottom.steepness - .51) < .02, `steepness ${bottom.steepness}`));
    if (mode === 'reduced') {
      await check(`${label} reduced: static full mountain, no travel, layers or crest`, () => {
        for (const s of down) { assert.equal(s.amp, 1); assert.equal(s.crest, 1); assert.equal(s.lean, 0); assert.equal(s.glow, 1); assert.equal(s.move, 0); assert.equal(s.layers, 0); }
      });
    } else {
      await check(`${label} wave rises progressively and returns on the way back`, () => {
        assert.ok(down[0].amp < .05, `start ${down[0].amp}`); assert.ok(bottom.amp > .99, `end ${bottom.amp}`);
        assert.ok(down.some(s => s.amp > .2 && s.amp < .8), 'intermediate states'); assert.ok(back.amp < .05, `back ${back.amp}`);
        assert.ok(visible.some(s => s.apex < height - 40), 'crest rises into view while the benefits are visible');
      });
      await check(`${label} swell starts late: still flat while the box is in the lowest 20% of the viewport`, () => {
        for (const s of down) if (s.boxY > height * .8) assert.ok(s.amp < .03, `amp ${s.amp} with the box at ${Math.round(s.boxY)}px`);
      });
      await check(`${label} at rest the wave stands straight`, () => { assert.ok(Math.abs(bottom.lean) <= .01, `lean ${bottom.lean}`); assert.ok(Math.abs(back.lean) <= .01, `lean ${back.lean}`); });
      await check(`${label} crest gathers and glow strengthens with the swell`, () => {
        for (const s of down) {
          assert.ok(Math.abs(s.crest - (1 + .06 * (1 - s.amp))) < .002, `crest ${s.crest} at ${s.amp}`);
          assert.ok(Math.abs(s.spread - s.layout * s.crest) < .002, `spread ${s.spread}`);
          assert.ok(Math.abs(s.glow - (.45 + .55 * s.amp)) < .003, `glow ${s.glow} at ${s.amp}`);
        }
        assert.equal(bottom.crest, 1);
      });
    }
    if (mode === 'motion') {
      await check(`${label} swell rises softly, overshoots slightly, leans and settles`, async () => {
        await page.evaluate(y => scrollTo(0, y), g.top - height * .62); await page.waitForTimeout(1200);
        const traceData = await page.evaluate(async y => {
          const curve = document.querySelector('.matebreak-curve'), values = [], leans = [];
          scrollTo(0, y);
          const t0 = performance.now();
          while (performance.now() - t0 < 1600) { await new Promise(r => requestAnimationFrame(r)); values.push(Number(curve.dataset.waveAmplitude)); leans.push(Number(curve.dataset.waveLean)); }
          return {values, leans};
        }, g.top - height * .45);
        const {values: trace, leans} = traceData;
        const start = trace[0], end = trace.at(-1), peak = Math.max(...trace);
        assert.ok(end - start > .1, `step ${start}->${end}`);
        const overshoot = (peak - end) / (end - start);
        assert.ok(overshoot > .005 && overshoot < .08, `overshoot ${(overshoot * 100).toFixed(1)}%`);
        assert.ok(Math.abs(trace.at(-10) - end) < .002, 'settled');
        assert.ok(Math.max(...leans.map(Math.abs)) > .02, 'leans while moving'); assert.ok(Math.abs(leans.at(-1)) < .01, 'straight once settled');
      });
      if (width >= 768) await check(`${label} 60-frame mate sequence still reaches its last frame`, async () => {
        await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(400);
        for (let y = 0; y < 1400; y += 70) { await page.mouse.wheel(0, 70); await page.waitForTimeout(40); }
        await page.waitForTimeout(600); assert.equal((await state(page)).frame, 60);
      });
    }
    await context.close();
  }
}
await browser.close(); server.close();
if (failures.length) { console.error(`${failures.length} FAILED:\n- ${failures.join('\n- ')}`); process.exit(1); }
console.log('Home mountain: all checks passed (6 widths × motion/fallback/reduced)');
