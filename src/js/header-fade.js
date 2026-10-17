document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('header.mb-public-header, header');
  if (!header) return;
  const transition = document.querySelector('.matebreak-transition');
  const curve = document.querySelector('.matebreak-curve');
  const homeCurve = document.body.hasAttribute('data-home') && transition && curve;
  let raf = null;
  let lastLight = null;
  function paint() {
    const rect = header.getBoundingClientRect();
    // The Home curve's apex is the first visible border point to touch the
    // full-width header. Its top is no longer clipped by the dark container.
    const boundary = homeCurve ? curve.getBoundingClientRect().top : curve && transition
      ? Math.max(transition.getBoundingClientRect().top, curve.getBoundingClientRect().top)
      : document.querySelector('section.bg-white, footer.bg-white')?.getBoundingClientRect().top;
    const light = boundary != null && boundary <= (homeCurve ? rect.bottom : rect.top + rect.height / 2);
    if (homeCurve) {
      const progress = Math.min(1, Math.max(0, window.scrollY / 180));
      header.style.setProperty('--home-header-blur', `${(progress * 14).toFixed(2)}px`);
      header.style.setProperty('--home-header-edge', progress.toFixed(3));
      header.style.setProperty('--home-header-background', light
        ? 'rgba(255,255,255,.94)' : `rgba(19,19,19,${(1 - progress * .12).toFixed(3)})`);
      header.classList.toggle('header-dark', light);
      lastLight = light;
      return;
    }
    lastLight = light;
    header.classList.toggle('header-dark', light);
    const color=light?'255,255,255':'23,24,21';
    // Marketing's legacy CSS clears background-color with !important;
    // an opaque gradient paints both approved rows without changing geometry.
    header.style.background = `linear-gradient(rgba(${color},.98),rgba(${color},.98))`;
  }
  const schedule = () => {if (raf === null) raf = requestAnimationFrame(() => {raf=null;paint();});};
  // Header translucency also changes before the curve enters the viewport.
  // mb:transition repaints after the curve moves, keeping color contact aligned.
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('pageshow', schedule);
  document.addEventListener('mb:transition', paint);
  document.addEventListener('visibilitychange', () => {if (!document.hidden) schedule();});
  new ResizeObserver(schedule).observe(header);
  paint();
});
