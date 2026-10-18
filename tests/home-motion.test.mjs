import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const home = read('index.html'), motionSource = read('src/js/home-motion.js'), curveScript = read('src/js/script.js');
const motionCss = read('src/css/home-motion.css'), responsive = read('src/css/responsive.css');
const vendored = 'src/js/vendor/motion-14.3.0.js';

test('Motion is vendored from the exact pinned package, with its license, and only as a dev dependency', () => {
  const pkg = JSON.parse(read('package.json')), lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.devDependencies.motion, '14.3.0');
  assert.equal(pkg.dependencies.motion, undefined, 'the backend must not install a browser animation library');
  assert.equal(lock.packages['node_modules/motion'].version, '14.3.0');
  assert.match(lock.packages['node_modules/motion'].integrity, /^sha512-/);
  assert.match(read('src/js/vendor/motion-LICENSE.md'), /MIT License/);
  const installed = new URL('../node_modules/motion/dist/motion.js', import.meta.url);
  if (existsSync(installed)) {
    const hash = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
    assert.equal(hash(read(vendored)), hash(readFileSync(installed, 'utf8')), 'vendored bundle must equal the locked package');
  }
  assert.ok(read(vendored).includes('Motion'), 'bundle exposes the vanilla global');
});

test('Home loads the local bundle first, deferred, with no CDN, React or bundler', () => {
  const bundle = home.indexOf('/src/js/vendor/motion-14.3.0.js'), layer = home.indexOf('/src/js/home-motion.js');
  assert.ok(bundle > 0 && layer > bundle, 'Motion must load before the layer that uses it');
  assert.match(home, /<script src="\/src\/js\/vendor\/motion-14\.3\.0\.js" defer><\/script>/);
  assert.match(home, /<script src="\/src\/js\/home-motion\.js" defer><\/script>/);
  assert.match(home, /href="\/src\/css\/home-motion\.css"/);
  assert.doesNotMatch(motionSource, /\bimport\b|require\(|react|fetch\(|XMLHttpRequest/i);
  assert.doesNotMatch(home, /unpkg|jsdelivr|cdnjs|esm\.sh|framer-motion/);
});

test('The Home mountain shares its travel with the Motion and legacy paths; other pages retain their curve', () => {
  assert.doesNotMatch(motionCss, /\.matebreak-(curve|transition)\s*[{,]/, 'home-motion.css must not restyle the arc or its clip box');
  assert.match(responsive, /\.matebreak-curve\{height:140%;bottom:-65%;border-radius:50% 50% 0 0 \/ 24% 24% 0 0;/);
  assert.match(curveScript, /const travel = home \? Number\(transition.dataset.curveTravel \|\| \.65\) : \.38;/);
  assert.match(home, /data-curve-travel=".18"/);
  assert.match(home, /data-curve-ridge/);
  assert.match(home, /vector-effect="non-scaling-stroke"/);
  assert.doesNotMatch(home, /framerusercontent/);
  assert.match(read('src/css/home-curve.css'), /background: #fff/);
  assert.match(curveScript, /hasAttribute\('data-mb-home-motion'\)\) return;/);
  // Other pages never receive the flag, so they keep the original curve maths.
  assert.doesNotMatch(motionSource, /querySelector\('\.matebreak-transition'\)/, 'layer is scoped to [data-home]');
});

test('Reduced motion: no idle float rule survives; glow layers are hidden', () => {
  assert.doesNotMatch(responsive, /animation:\s*mateFloat[^;]*infinite\s*!important/);
  assert.match(responsive, /prefers-reduced-motion: reduce\) \{\s*\[data-home\] \[data-seq-img\] \{ animation: none !important; \}/);
  assert.match(motionCss, /prefers-reduced-motion: reduce\) \{\s*\.mb-curve-halo, \.mb-curve-glint \{ display: none; \}/);
});

// ---- behaviour of the layer against a minimal DOM and a recording Motion ---------
function harness({reduced = false, withMotion = true} = {}) {
  const log = {scroll: 0, inView: 0, animations: [], removed: 0, events: [], listeners: {}};
  const style = () => ({props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; }});
  const pose = {style: {}}, img = {style: style(), parentElement: pose};
  const curve = {children: [], offsetWidth: 2304, offsetHeight: 363, style: style(), append(...nodes) { nodes.forEach(n => { n.parent = this; this.children.push(n); }); }};
  const transition = {offsetHeight: 259, getBoundingClientRect: () => ({top: 500, height: 259}), querySelector: () => curve};
  const section = {querySelector: () => img, getBoundingClientRect: () => ({top: 300, height: 800})};
  const attrs = new Set();
  const media = {};
  const matchMedia = query => (media[query] ??= {
    matches: query.includes('reduced') ? reduced : false, change: [],
    addEventListener(name, fn) { this.change.push(fn); }
  });
  const value = initial => { let v = initial; const subs = []; return {get: () => v, set(n) { v = n; subs.forEach(f => f(v)); }, jump(n) { v = n; },
    on(name, fn) { subs.push(fn); return () => subs.splice(subs.indexOf(fn), 1); }}; };
  const control = () => { const c = {state: 'running', pause() { c.state = 'paused'; }, play() { c.state = 'running'; }, cancel() { c.state = 'cancelled'; }}; log.animations.push(c); return c; };
  const Motion = {
    motionValue: value, springValue: raw => { const out = value(raw.get()); raw.on('change', v => out.set(v)); return out; },
    scroll: () => { log.scroll++; return () => { log.scroll--; }; },
    inView: () => { log.inView++; return () => { log.inView--; }; },
    animateMini: control, animate: control, clamp: (min, max, v) => Math.min(max, Math.max(min, v))
  };
  const document = {
    hidden: false,
    documentElement: {setAttribute: k => attrs.add(k), removeAttribute: k => attrs.delete(k), hasAttribute: k => attrs.has(k)},
    addEventListener(name, fn) { (log.listeners[name] ??= []).push(fn); },
    removeEventListener() {}, dispatchEvent: e => log.events.push(e.type),
    createElement: () => ({className: '', style: style(), offsetWidth: 560, offsetHeight: 120, setAttribute() {}, remove() { log.removed++; this.parent.children.splice(this.parent.children.indexOf(this), 1); }}),
    querySelector: selector => selector.includes('scroll-sequence') ? section : selector.includes('matebreak-transition') ? transition : null
  };
  const window = {Motion: withMotion ? Motion : undefined, dispatchEvent: e => log.events.push('window:' + e.type)};
  const context = {window, document, matchMedia, innerHeight: 900, innerWidth: 1440,
    getComputedStyle: () => ({borderTopLeftRadius: '50% 24%'}), Event: class { constructor(type) { this.type = type; } },
    ResizeObserver: class { observe() {} disconnect() {} }};
  runInNewContext(motionSource, context);
  log.listeners.DOMContentLoaded?.forEach(fn => fn());
  return {log, attrs, curve, img, pose, media, setReduced(value) { media['(prefers-reduced-motion: reduce)'].matches = value;
    media['(prefers-reduced-motion: reduce)'].change.forEach(fn => fn()); }};
}

test('Layer does nothing without Motion, or when reduced motion is requested', () => {
  for (const options of [{withMotion: false}, {reduced: true}]) {
    const h = harness(options);
    assert.equal(h.attrs.size, 0, 'legacy curve script must stay in charge');
    assert.equal(h.curve.children.length, 0);
    assert.equal(h.log.scroll + h.log.inView + h.log.animations.length, 0, 'no observers or animations are created');
    assert.equal(h.img.style.props.animation, undefined, 'no inline override of the CSS state');
    assert.equal(h.pose.style.transform, undefined);
  }
});

test('With motion allowed the layer builds once, pauses idle loops offscreen, and cleans up completely', () => {
  const h = harness();
  assert.ok(h.attrs.has('data-mb-home-motion'));
  assert.deepEqual(h.curve.children.map(n => n.className), ['mb-curve-halo', 'mb-curve-glint']);
  const glint = h.curve.children[1];
  assert.match(glint.style.transform, /^translate3d\(-?[\d.]+px,-?[\d.]+px,0\)$/, 'glint is placed with transform only');
  assert.equal(h.img.style.props.animation, 'none');
  assert.match(h.pose.style.transform, /translate3d\(.*\) rotate\(.*deg\) scale\(/);
  assert.equal(h.log.scroll, 2, 'one scroll observer for the mate, one for the curve');
  assert.equal(h.log.inView, 2);
  assert.ok(h.log.animations.every(c => c.state === 'paused'), 'idle float and sweep wait for visibility');
  // The visitor turns reduced motion on while the page is open.
  h.setReduced(true);
  assert.equal(h.attrs.size, 0);
  assert.equal(h.curve.children.length, 0);
  assert.equal(h.pose.style.transform, '', 'pose removed');
  assert.equal(h.log.scroll + h.log.inView, 0, 'observers released');
  assert.ok(h.log.animations.every(c => c.state === 'cancelled'));
  assert.ok(h.log.events.includes('window:resize'), 'legacy script is told to repaint');
  // And turns it off again: rebuilt exactly once.
  h.setReduced(false);
  assert.equal(h.curve.children.length, 2);
  assert.equal(h.log.scroll, 2);
});

test('Mountain integration: closer sections, organic crest, glow tied to the swell and a livelier wave spring', () => {
  const curveCss = read('src/css/home-curve.css'), painter = read('src/js/script.js');
  // Only the clearance the risen apex needs remains above the box (padding: 120px, or clamp(36px, 6vw, 60px) below 1024px).
  assert.match(curveCss, /--mb-wave-clearance: calc\(22px \+ clamp\(21px, 3\.52vw, 62px\)\);\n\s*margin-top: calc\(var\(--mb-wave-clearance\) - 120px\);/);
  assert.match(curveCss, /@media \(max-width: 1023px\) \{\n\s*\/\*[^*]*\*\/\n\s*\[data-home\] \.matebreak-transition\.mb-mountain-transition \{ margin-top: calc\(var\(--mb-wave-clearance\) - clamp\(36px, 6vw, 60px\)\); \}/);
  assert.match(painter, /const start = \.06;/);
  assert.match(painter, /const spread = still \? 1 : 1 \+ \.06 \* \(1 - amplitude\);/);
  assert.match(painter, /scale\(\$\{spread\.toFixed\(5\)\} \$\{amplitude\.toFixed\(5\)\}\)/);
  assert.match(painter, /ridgeGlow\?\.setAttribute\('opacity', still \? '1' : \(\.45 \+ \.55 \* amplitude\)\.toFixed\(3\)\);/);
  assert.match(home, /<g filter="url\(#mb-ridge-glow\)" data-ridge-glow>/);
  assert.match(motionSource, /if \(curve\.mbSetWave\) follow\(transition, p => \{[\s\S]*?\}, \{stiffness: 120, damping: 15, mass: \.9/);
  assert.match(motionSource, /\(lerp\(arc\.points\[a\]\.x, arc\.points\[b\]\.x, position - a\) - centre\) \* waveSpread/);
});
