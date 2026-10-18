document.addEventListener('DOMContentLoaded', () => {
  // Loaded once for every page through header-account.js.
  if (window.mbHeaderTheme) return;
  window.mbHeaderTheme = true;
  const header = document.querySelector('header.mb-public-header, header');
  if (!header) return;
  const transition = document.querySelector('.matebreak-transition');
  const curve = document.querySelector('.matebreak-curve');
  const homeCurve = document.body.hasAttribute('data-home') && transition && curve;
  let raf = null;
  let lastLight = null;
  // Tint the shared header with the page's own dark background so it blends in.
  if (!homeCurve) for (const element of [document.body, document.documentElement]) {
    const [r, g, b, a = 1] = (getComputedStyle(element).backgroundColor.match(/[\d.]+/g) || []).map(Number);
    if (!(a > .5)) continue;
    if (.2126 * r + .7152 * g + .0722 * b < 60) header.style.setProperty('--mb-header-tint', `${r}, ${g}, ${b}`);
    break;
  }
  function paint() {
    const rect = header.getBoundingClientRect();
    // The Home curve's apex is the first visible border point to touch the
    // full-width header. Its top is no longer clipped by the dark container.
    const boundary = homeCurve ? (curve.querySelector('[data-curve-apex]') || curve).getBoundingClientRect().top : curve && transition
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
    // Over dark content the shared Podcast surface applies (transparent + masked
    // blur in public-header.css). Over a light section the text turns dark, so the
    // header needs an opaque light surface to keep its contrast.
    header.style.background = light ? 'linear-gradient(rgba(255,255,255,.98),rgba(255,255,255,.98))' : '';
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
