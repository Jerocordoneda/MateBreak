// Real browser / real Motion. Commerce responses are read-only local fixtures.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import express from 'express';
import {productCardData} from '../server/modules/catalog/routes.mjs';
const {chromium} = await import(pathToFileURL(process.env.MATEBREAK_BROWSER_MODULE).href);
const output = process.env.MATEBREAK_MOTION_PROOF;
assert.ok(output); fs.mkdirSync(output, {recursive: true});
const app = express();
const products = JSON.parse(fs.readFileSync(process.env.MATEBREAK_CATALOG_SNAPSHOT));
app.get('/api/productos', (_, res) => res.json(products.map(productCardData)));
app.get('/api/sesion', (_, res) => res.json({usuario: null}));
app.get('/api/carrito/resumen', (_, res) => res.json({cantidad: 0}));
app.get('/api/carrito', (_, res) => res.json({items: [], resumen: {subtotal: 0, total: 0}}));
app.use('/api', (_, res) => res.sendStatus(405));
app.use(express.static(path.resolve('dist'), {dotfiles: 'allow'}));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = process.env.MATEBREAK_MOTION_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel: 'chrome', headless: true});
const report = {origin, cases: [], errors: []};
const measure = () => {
  const header = document.querySelector('header'), img = document.querySelector('[data-seq-img]');
  const curve = document.querySelector('.matebreak-curve'), glow = document.querySelector('.mb-curve-glow');
  return {scroll: scrollY, overflow: document.documentElement.scrollWidth - innerWidth,
    background: getComputedStyle(header).backgroundColor, blur: getComputedStyle(header).backdropFilter,
    light: header.classList.contains('header-dark'), transform: getComputedStyle(img).transform,
    image: img.getAttribute('src'), complete: img.complete && img.naturalWidth > 0,
    curve: getComputedStyle(curve).transform, glow: getComputedStyle(glow).opacity,
    animations: document.getAnimations().filter(a => [img, glow].includes(a.effect?.target)).map(a => a.playState),
    width: header.getBoundingClientRect().width};
};
try {
  const widths = process.env.MATEBREAK_MOTION_WIDTHS?.split(',').map(Number) || [320, 360, 375, 390, 414, 430, 768, 1024, 1440];
  for (const width of widths) {
    const context = await browser.newContext({viewport: {width, height: 900}});
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(origin, {waitUntil: 'networkidle'});
    await page.locator('.catalog-card').first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(450);
    const top = await page.evaluate(measure);
    assert.equal(top.background, 'rgb(19, 19, 19)');
    assert.equal(top.overflow, 0); assert.equal(top.width, width);
    const positions = await page.evaluate(() => {
      const s = document.querySelector('[data-scroll-sequence]').getBoundingClientRect();
      const c = document.querySelector('.matebreak-transition').getBoundingClientRect();
      return [180, s.top + scrollY, s.bottom + scrollY - innerHeight,
        c.top + scrollY - 450, c.top + scrollY + 200];
    });
    const states = [];
    for (const y of positions) {
      await page.evaluate(y => scrollTo({top: y, behavior: 'instant'}), y);
      await page.waitForTimeout(550);
      const state = await page.evaluate(measure); states.push(state);
      assert.equal(state.overflow, 0, `${width}px overflow at ${y}`);
      assert.ok(state.complete, 'The displayed mate stays decoded');
    }
    assert.notEqual(states[0].blur, 'blur(0px)');
    assert.ok(states.at(-1).light); assert.notEqual(top.transform, states[1].transform);
    if (width > 760) assert.notEqual(top.image, states[2].image, 'Desktop frame sequence advances');
    await page.evaluate(y => scrollTo({top: y, behavior: 'instant'}), positions[3]);
    await page.waitForTimeout(700);
    const glowA = await page.evaluate(measure);
    await page.waitForTimeout(400);
    const glowB = await page.evaluate(measure);
    assert.notEqual(glowA.glow, glowB.glow, 'Golden highlight continuously animates');
    if ([390, 1440].includes(width)) await page.screenshot({path: path.join(output, `after-${width}-curve.png`)});
    // Preference changes while on the page must cancel running native animations.
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.waitForTimeout(100);
    const reduced = await page.evaluate(measure);
    assert.equal(reduced.transform, 'none'); assert.deepEqual(reduced.animations, []);
    await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
    await page.waitForTimeout(100);
    const reducedTop = await page.evaluate(measure);
    assert.equal(reducedTop.curve, reduced.curve);
    assert.equal(reducedTop.image, reduced.image);
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await page.waitForTimeout(600);
    if ([390, 1440].includes(width)) await page.screenshot({path: path.join(output, `after-${width}-top.png`)});
    // Rapid reversals settle back to the same pose; no growing layout or listeners.
    for (const y of [positions[1], 0, positions[2], 0]) await page.evaluate(y => scrollTo({top:y, behavior:'instant'}), y);
    await page.waitForTimeout(600);
    assert.equal((await page.evaluate(measure)).overflow, 0);
    const performance = await page.evaluate(async () => {
      const intervals = [], longTasks = []; let cls = 0;
      const observer = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          if (e.entryType === 'longtask') longTasks.push(e.duration);
          if (e.entryType === 'layout-shift' && !e.hadRecentInput) cls += e.value;
        }
      });
      observer.observe({entryTypes: ['longtask', 'layout-shift']});
      await new Promise(resolve => {
        let start, previous;
        function frame(t) {
          start ??= t; if (previous) intervals.push(t - previous); previous = t;
          scrollTo({top: 600 * (1 - Math.cos((t - start) / 1600 * Math.PI)) / 2, behavior: 'instant'});
          if (t - start < 1600) requestAnimationFrame(frame); else resolve();
        }
        requestAnimationFrame(frame);
      });
      observer.disconnect(); intervals.sort((a,b) => a-b);
      return {frames: intervals.length, p95Ms: intervals[Math.floor(intervals.length * .95)], longTasks, cls};
    });
    assert.equal(performance.cls, 0, 'Scrolling animations do not shift layout');
    await page.setViewportSize({width: width > 760 ? 390 : 1440, height: 900});
    await page.waitForTimeout(600);
    assert.equal((await page.evaluate(measure)).overflow, 0);
    report.cases.push({width, top, states, reduced, performance});
    await context.close();
    console.log(`PASS ${width}px: scroll, reverse, continuous glow, reduced motion, resize`);
  }
  const reducedContext = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
  const reducedPage = await reducedContext.newPage(); const frameRequests = new Set();
  reducedPage.on('request', request => {if (request.url().includes('/frames-mate1/')) frameRequests.add(request.url());});
  await reducedPage.goto(origin, {waitUntil: 'networkidle'});
  await reducedPage.evaluate(() => scrollTo({top: 700, behavior: 'instant'}));
  await reducedPage.waitForTimeout(500);
  assert.equal(frameRequests.size, 1, 'Initial reduced motion loads only the static mate');
  assert.deepEqual((await reducedPage.evaluate(measure)).animations, []);
  await reducedContext.close();
  assert.deepEqual(report.errors, []);
} finally {
  fs.writeFileSync(path.join(output, 'motion-proof.json'), JSON.stringify(report, null, 2));
  await browser.close(); server.close();
}
