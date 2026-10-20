document.addEventListener('DOMContentLoaded', () => {
  const transition = document.querySelector('.matebreak-transition');
  const curve = document.querySelector('.matebreak-curve');
  if (!transition || !curve) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const home = document.body.hasAttribute('data-home');
  const waveShapes = [...curve.querySelectorAll('[data-wave-shape]')];
  const ridgeGlow = curve.querySelector('[data-ridge-glow]');
  // One shared painter for Motion's spring and the ordinary scroll fallback.
  // SVG transforms keep the ridge/fill attached to the lower white edge. The
  // stroke uses non-scaling-stroke; its gold line never thins as the wave opens.
  // Width: on every screen the bell is 1.3 times the screen width, so the body of
  // the wave fills most of the width and its sides meet the baseline just past
  // the edges (they are clipped by the box).
  const BELL_WIDTH = 1.3;
  const CM = 96 / 2.54; // CSS px per cm at 100% zoom
  // reduced: prefers-reduced-motion. The rise still follows the visitor's own
  // scrolling (like the mate's photograph sequence) but without spring, lean,
  // crest morph, travel or glow changes.
  if (waveShapes.length) curve.mbSetWave = (progress, reduced = false, height = transition.offsetHeight, lean = 0) => {
    const phone = innerWidth <= 760;
    // Starts once the transition is ~22% into the viewport; on phones 3.5 cm of
    // scroll later than that, so it does not form too early.
    const delay = .22 * innerHeight + (phone ? 3.5 * CM : 0);
    const start = delay / (innerHeight + height);
    const finish = Math.max(start + .2, innerHeight * .82 / (innerHeight + height));
    const phase = Math.max(0, Math.min(1, (progress - start) / (finish - start)));
    const amplitude = .015 + .985 * phase * phase * (3 - 2 * phase);
    const layout = BELL_WIDTH;
    // Organic crest: the swell starts up to 6% broader and gathers into the
    // mountain as it rises. While it moves it leans slightly with its speed (lean
    // comes from Motion's spring velocity) and straightens as it settles.
    const crest = reduced ? 1 : 1 + .06 * (1 - amplitude);
    const tilt = reduced ? 0 : lean;
    const spread = layout * crest;
    const matrix = [spread, 0, tilt * amplitude * layout, amplitude, 0, 0].map(n => +n.toFixed(5)).join(' ');
    for (const shape of waveShapes) shape.setAttribute('transform', `translate(960 640) matrix(${matrix}) translate(-960 -640)`);
    ridgeGlow?.setAttribute('opacity', reduced ? '1' : (.45 + .55 * amplitude).toFixed(3));
    curve.style.setProperty('--wave-apex', `${(640 / 676 * (1 - amplitude) * 100).toFixed(5)}%`);
    Object.assign(curve.dataset, {waveAmplitude: amplitude.toFixed(5), waveCrest: crest.toFixed(5),
      waveLayout: layout.toFixed(5), waveSpread: spread.toFixed(5), waveLean: tilt.toFixed(5)});
    return amplitude;
  };
  let raf = null;
  function update() {
    raf = null;
    // home-motion.js drives the Home curve (and mb:transition) while active.
    if (home && document.documentElement.hasAttribute('data-mb-home-motion')) return;
    const rect = transition.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (innerHeight - rect.top) / (innerHeight + rect.height)));
    // Home's light surface rises from its centre without inertia or a clipped
    // flat edge. Keep other pages' existing transition untouched.
    const eased = home ? progress * progress * (3 - 2 * progress) : progress;
    const travel = home ? Number(transition.dataset.curveTravel || .65) : .38;
    curve.style.setProperty('--curve-move', reduced.matches ? '0px' : `${-rect.height * travel * eased}px`);
    curve.mbSetWave?.(progress, reduced.matches, rect.height);
    document.dispatchEvent(new Event('mb:transition'));
  }
  const schedule = () => {if (raf === null) raf = requestAnimationFrame(update);};
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});
  reduced.addEventListener('change', schedule);
  window.addEventListener('pageshow', schedule);
  update();
});
