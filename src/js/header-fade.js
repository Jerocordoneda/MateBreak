document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header.mb-public-header, header');
  if (!header) return;
  const transition = document.querySelector('.matebreak-transition');
  const curve = document.querySelector('.matebreak-curve');
  let raf = null;
  function paint() {
    const rect = header.getBoundingClientRect();
    // Compare the rendered centre edge with the actual fixed header, including
    // the transition's clipping container. No historical pixel trigger.
    const boundary = curve && transition
      ? Math.max(transition.getBoundingClientRect().top, curve.getBoundingClientRect().top)
      : document.querySelector('section.bg-white, footer.bg-white')?.getBoundingClientRect().top;
    const light = boundary != null && boundary <= rect.top + rect.height / 2;
    header.classList.toggle('header-dark', light);
    const color=light?'255,255,255':'23,24,21';
    // Marketing's legacy CSS clears background-color with !important;
    // an opaque gradient paints both approved rows without changing geometry.
    header.style.background = `linear-gradient(rgba(${color},.98),rgba(${color},.98))`;
  }
  const schedule = () => {if (raf === null) raf = requestAnimationFrame(() => {raf=null;paint();});};
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('pageshow', schedule);
  document.addEventListener('mb:transition', paint);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) schedule();});
  new ResizeObserver(schedule).observe(header);
  paint();
});
