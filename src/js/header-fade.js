document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header');
  if (!header) return;
  const transition = document.querySelector('.matebreak-transition');
  const curve = document.querySelector('.matebreak-curve');
  let raf = null;
  function paint() {
    const rect = header.getBoundingClientRect();
    // Use the actual ellipse centre edge, clamped to its clipping container.
    const boundary = curve && transition
      ? Math.max(transition.getBoundingClientRect().top, curve.getBoundingClientRect().top)
      : document.querySelector('section.bg-white, footer.bg-white')?.getBoundingClientRect().top;
    const light = boundary != null && boundary <= rect.top + rect.height / 2;
    header.classList.toggle('header-dark', light);
    header.style.background = light
      ? 'linear-gradient(to bottom,rgba(255,255,255,.98),rgba(255,255,255,.94))'
      : 'linear-gradient(to bottom,rgba(19,19,19,.98),rgba(19,19,19,.94))';
  }
  const schedule = () => { if (raf === null) raf = requestAnimationFrame(() => {raf=null;paint();}); };
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('pageshow', schedule);
  document.addEventListener('mb:transition', paint);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) schedule();});
  new ResizeObserver(schedule).observe(header);
  paint();
});
