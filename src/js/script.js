document.addEventListener('DOMContentLoaded', () => {
  const transition = document.querySelector('.matebreak-transition');
  const curve = document.querySelector('.matebreak-curve');
  if (!transition || !curve) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const home = document.body.hasAttribute('data-home');
  const waveShapes = [...curve.querySelectorAll('[data-wave-shape]')];
  // One shared painter for Motion's spring and the ordinary scroll fallback.
  // SVG transforms keep the ridge/fill attached to the lower white edge. The
  // stroke uses non-scaling-stroke; its gold line never thins as the wave opens.
  if (waveShapes.length) curve.mbSetWave = (progress, still = false, height = transition.offsetHeight) => {
    const start = height * (640 / 676) / (innerHeight + height) - .04;
    const finish = Math.max(start + .2, innerHeight * .82 / (innerHeight + height));
    const phase = Math.max(0, Math.min(1, (progress - start) / (finish - start)));
    const amplitude = still ? 1 : .015 + .985 * phase * phase * (3 - 2 * phase);
    for (const shape of waveShapes) shape.setAttribute('transform', `translate(0 640) scale(1 ${amplitude.toFixed(5)}) translate(0 -640)`);
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
