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
  // The box size is cached (no layout reads per frame).
  let box = {width: curve.offsetWidth, height: curve.offsetHeight};
  if (waveShapes.length) new ResizeObserver(() => { box = {width: curve.offsetWidth, height: curve.offsetHeight}; }).observe(curve);
  // Phone proportions on every screen: the stretched viewBox makes the bell this
  // steep on a 390 px phone. Wider boxes narrow the bell to the same steepness and
  // the flat gold shoulders fill the rest; phones keep their exact shape.
  const PHONE_STEEPNESS = 1.53; // (210 / 676) / (390 / 1920)
  if (waveShapes.length) curve.mbSetWave = (progress, still = false, height = transition.offsetHeight, lean = 0) => {
    // Starts once the transition is ~22% into the viewport, not on first sight.
    const start = .22 * innerHeight / (innerHeight + height);
    const finish = Math.max(start + .2, innerHeight * .82 / (innerHeight + height));
    const phase = Math.max(0, Math.min(1, (progress - start) / (finish - start)));
    const amplitude = still ? 1 : .015 + .985 * phase * phase * (3 - 2 * phase);
    const layout = Math.min(1, (box.height / 676) / ((box.width || 1) / 1920) / PHONE_STEEPNESS);
    // Organic crest: the swell starts up to 6% broader and gathers into the
    // mountain as it rises. While it moves it leans slightly with its speed (lean
    // comes from Motion's spring velocity) and straightens as it settles. Reduced
    // motion and the resting state are the exact mountain with full glow.
    const crest = still ? 1 : 1 + .06 * (1 - amplitude);
    const tilt = still ? 0 : lean;
    const spread = layout * crest;
    const matrix = [spread, 0, tilt * amplitude * layout, amplitude, 0, 0].map(n => +n.toFixed(5)).join(' ');
    for (const shape of waveShapes) shape.setAttribute('transform', `translate(960 640) matrix(${matrix}) translate(-960 -640)`);
    ridgeGlow?.setAttribute('opacity', still ? '1' : (.45 + .55 * amplitude).toFixed(3));
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
