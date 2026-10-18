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
  if (waveShapes.length) curve.mbSetWave = (progress, still = false, height = transition.offsetHeight) => {
    // The swell starts as soon as the transition enters the viewport, so its
    // white crest rises into view right under the benefits instead of after a
    // long empty band; it still reaches the full mountain at the same point.
    const start = .06;
    const finish = Math.max(start + .2, innerHeight * .82 / (innerHeight + height));
    const phase = Math.max(0, Math.min(1, (progress - start) / (finish - start)));
    const amplitude = still ? 1 : .015 + .985 * phase * phase * (3 - 2 * phase);
    // Organic crest: the swell starts up to 6% broader and gathers into the
    // mountain as it rises; the ridge glow strengthens with it. Both settle at
    // the exact mountain and full glow (also the static reduced-motion state).
    const spread = still ? 1 : 1 + .06 * (1 - amplitude);
    for (const shape of waveShapes) shape.setAttribute('transform', `translate(960 640) scale(${spread.toFixed(5)} ${amplitude.toFixed(5)}) translate(-960 -640)`);
    ridgeGlow?.setAttribute('opacity', still ? '1' : (.45 + .55 * amplitude).toFixed(3));
    curve.dataset.waveSpread = spread.toFixed(5);
    curve.style.setProperty('--wave-apex', `${(640 / 676 * (1 - amplitude) * 100).toFixed(5)}%`);
    curve.dataset.waveAmplitude = amplitude.toFixed(5);
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
