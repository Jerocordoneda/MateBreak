document.addEventListener('DOMContentLoaded', () => {
  const transition = document.querySelector('.matebreak-transition');
  const curve = document.querySelector('.matebreak-curve');
  if (!transition || !curve) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const home = document.body.hasAttribute('data-home');
  let raf = null;
  function update() {
    raf = null;
    const rect = transition.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (innerHeight - rect.top) / (innerHeight + rect.height)));
    // Home's light surface rises from its centre without inertia or a clipped
    // flat edge. Keep other pages' existing transition untouched.
    const eased = home ? progress * progress * (3 - 2 * progress) : progress;
    const travel = home ? .65 : .38;
    curve.style.setProperty('--curve-move', reduced.matches ? '0px' : `${-rect.height * travel * eased}px`);
    document.dispatchEvent(new Event('mb:transition'));
  }
  const schedule = () => {if (raf === null) raf = requestAnimationFrame(update);};
  if (home && window.Motion) {
    window.Motion.scroll(update, {target: transition, offset: ['start end', 'end start']});
  } else {
    window.addEventListener('scroll', schedule, {passive:true});
  }
  window.addEventListener('resize', schedule, {passive:true});
  reduced.addEventListener('change', schedule);
  window.addEventListener('pageshow', schedule);
  update();
});
