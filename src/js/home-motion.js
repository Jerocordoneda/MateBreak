// Home-only, native transform/opacity animations. The photograph cache remains
// in scroll-sequence.js; Motion owns scroll observation and the image's pose.
document.addEventListener('DOMContentLoaded', () => {
  const section = document.querySelector('[data-home] [data-scroll-sequence]');
  const img = section?.querySelector('[data-seq-img]');
  const curve = document.querySelector('[data-home] .matebreak-curve');
  if (!img || !curve || !window.Motion) return;
  const {animateMini, scroll, inView} = window.Motion;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 760px)');
  const glow = document.createElement('span');
  glow.className = 'mb-curve-glow';
  glow.setAttribute('aria-hidden', 'true');
  curve.append(glow);
  let dispose = () => {};

  function configure() {
    dispose();
    img.style.removeProperty('transform');
    glow.style.opacity = '0';
    if (reduced.matches) return;
    const distance = mobile.matches ? 6 : 16;
    const pose = animateMini(img, {
      transform: [`translateY(${distance}px) rotate(-1deg)`, `translateY(${-distance}px) rotate(1deg)`]
    }, {duration: 1, ease: 'linear', autoplay: false});
    const stopScroll = scroll(pose, {target: section, offset: ['start end', 'end start']});
    // Only opacity changes during idle; no continuous layout reads or large
    // moving surfaces. Stop the infinite animation offscreen/in background tabs.
    const shimmer = animateMini(glow, {opacity: [0.15, 0.65, 0.15]}, {
      duration: 7, repeat: Infinity, ease: 'easeInOut', autoplay: false
    });
    let visible = false;
    const sync = () => visible && !document.hidden ? shimmer.play() : shimmer.pause();
    const stopView = inView(curve, () => {
      visible = true; sync();
      return () => {visible = false; sync();};
    });
    document.addEventListener('visibilitychange', sync);
    dispose = () => {
      stopScroll(); stopView(); pose.cancel(); shimmer.cancel();
      document.removeEventListener('visibilitychange', sync);
    };
  }
  reduced.addEventListener('change', configure);
  mobile.addEventListener('change', configure);
  configure();
});
