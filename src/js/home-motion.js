// Home-only motion layer. Motion (vendored, vanilla) smooths what the existing
// scripts already compute from real scroll geometry; it never replaces them.
//  - scroll-sequence.js keeps owning the 60 photographs, preload and drag.
//  - script.js keeps the curve maths for every other page and as the fallback.
// If Motion fails to load, or the visitor prefers reduced motion, this file
// leaves the page exactly as it was before it existed.
(() => {
  const Motion = window.Motion;
  if (!Motion) return;
  document.addEventListener('DOMContentLoaded', () => {
    const section = document.querySelector('[data-home] [data-scroll-sequence]');
    const img = section?.querySelector('[data-seq-img]');
    const transition = document.querySelector('[data-home] .matebreak-transition');
    const curve = transition?.querySelector('.matebreak-curve');
    if (!section || !img || !transition || !curve) return;
    const pose = img.parentElement;
    const {animate, animateMini, scroll, inView, motionValue, springValue, clamp} = Motion;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const compact = matchMedia('(max-width: 760px)');
    const root = document.documentElement;
    let dispose = () => {};

    const lerp = (a, b, t) => a + (b - a) * t;
    const smoothstep = t => t * t * (3 - 2 * t);
    const progressOf = el => {
      const rect = el.getBoundingClientRect();
      return clamp(0, 1, (innerHeight - rect.top) / (innerHeight + rect.height));
    };

    function build() {
      const cleanups = [];
      const own = fn => { cleanups.push(fn); return fn; };
      // Smoothed progress: Motion's spring follows the raw scroll position, so
      // direction changes ease instead of snapping. Settles in well under 400 ms.
      function follow(el, onFrame, spring) {
        const raw = motionValue(progressOf(el));
        const smooth = springValue(raw, spring);
        smooth.jump(raw.get());
        own(scroll(p => raw.set(p), {target: el, offset: ['start end', 'end start']}));
        own(smooth.on('change', onFrame));
        onFrame(smooth.get());
        return smooth;
      }

      // ---- Mate: parallax, tilt and breathing on its wrapper -------------------
      const tune = compact.matches
        ? {lift: 26, tilt: 5, low: .97, high: 1.02, bob: 7, turn: 1}
        : {lift: 46, tilt: 5.5, low: .96, high: 1.03, bob: 16, turn: 1.4};
      pose.style.willChange = 'transform';
      follow(section, p => {
        const y = lerp(-tune.lift, tune.lift, p);
        const rotate = lerp(-tune.tilt, tune.tilt, p);
        const scale = lerp(tune.low, tune.high, Math.sin(Math.PI * p));
        pose.style.transform = `translate3d(0,${y.toFixed(2)}px,0) rotate(${rotate.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
      }, {stiffness: 120, damping: 24, mass: .85, restDelta: .0004, restSpeed: .002});
      own(() => { pose.style.transform = ''; pose.style.willChange = ''; });

      // Idle float on the photograph itself, compositor-run (WAAPI transform).
      img.style.setProperty('animation', 'none', 'important');
      const float = animateMini(img, {
        transform: [
          `translate3d(0,0,0) rotate(${-tune.turn}deg)`,
          `translate3d(0,${-tune.bob}px,0) rotate(${tune.turn}deg)`,
          `translate3d(0,0,0) rotate(${-tune.turn}deg)`
        ]
      }, {duration: 5.2, ease: 'easeInOut', repeat: Infinity});
      float.pause();
      own(() => { float.cancel(); img.style.removeProperty('animation'); });

      // ---- Curve: eased rise + golden light travelling along the arc ----------
      const halo = document.createElement('span');
      const glint = document.createElement('span');
      halo.className = 'mb-curve-halo';
      glint.className = 'mb-curve-glint';
      halo.setAttribute('aria-hidden', 'true');
      glint.setAttribute('aria-hidden', 'true');
      curve.append(halo, glint);
      own(() => { halo.remove(); glint.remove(); curve.style.removeProperty('--curve-move'); });

      // The glint rides the arc's own ellipse (read from the curve's CSS radii, so
      // it keeps following the geometry if that is ever retuned). Only transform
      // and opacity change per frame: no repaint of the large curve layer.
      let arc = {rx: 1, ry: 0, half: 1, gw: 0, gh: 0};
      const radius = (value, size) => value.endsWith('%') ? parseFloat(value) / 100 * size : parseFloat(value);
      const measureArc = () => {
        const [rx, ry] = getComputedStyle(curve).borderTopLeftRadius.split(' ');
        arc = {rx: radius(rx, curve.offsetWidth) || 1, ry: radius(ry || rx, curve.offsetHeight) || 0,
          half: innerWidth * .56, gw: glint.offsetWidth, gh: glint.offsetHeight};
      };
      const place = t => {
        const x = t * arc.half;
        const y = arc.ry * (1 - Math.sqrt(Math.max(0, 1 - (x / arc.rx) ** 2)));
        glint.style.transform = `translate3d(${(x - arc.gw / 2).toFixed(1)}px,${(y - arc.gh / 2).toFixed(1)}px,0)`;
      };
      measureArc();
      place(-1);

      root.setAttribute('data-mb-home-motion', '');
      own(() => root.removeAttribute('data-mb-home-motion'));
      let travel = transition.offsetHeight * .65;
      const measure = new ResizeObserver(() => { travel = transition.offsetHeight * .65; measureArc(); });
      measure.observe(transition);
      own(() => measure.disconnect());
      follow(transition, p => {
        // Same travel and easing as script.js (apex rises, never flattens); the
        // header reads the rendered apex on mb:transition, so contact stays exact.
        curve.style.setProperty('--curve-move', `${(-travel * smoothstep(p)).toFixed(2)}px`);
        const peak = Math.sin(Math.PI * clamp(0, 1, p * 1.15));
        halo.style.opacity = (.4 + .6 * peak).toFixed(3);
        glint.style.opacity = (.5 + .5 * peak).toFixed(3);
        document.dispatchEvent(new Event('mb:transition'));
      }, {stiffness: 150, damping: 28, mass: .8, restDelta: .0003, restSpeed: .002});

      const sweep = animate(-1, 1, {
        duration: 5.6, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.4, onUpdate: place
      });
      sweep.pause();
      own(() => sweep.cancel());

      // Idle loops run only while visible and while the tab is in the foreground.
      let onScreen = {mate: false, curve: false};
      const sync = () => {
        (onScreen.mate && !document.hidden ? float.play : float.pause).call(float);
        (onScreen.curve && !document.hidden ? sweep.play : sweep.pause).call(sweep);
      };
      own(inView(section, () => { onScreen.mate = true; sync(); return () => { onScreen.mate = false; sync(); }; }, {margin: '120px'}));
      own(inView(transition, () => { onScreen.curve = true; sync(); return () => { onScreen.curve = false; sync(); }; }, {margin: '120px'}));
      document.addEventListener('visibilitychange', sync);
      own(() => document.removeEventListener('visibilitychange', sync));

      return () => cleanups.splice(0).reverse().forEach(fn => { try { fn(); } catch {} });
    }

    function configure() {
      dispose();
      dispose = () => {};
      if (!reduced.matches) dispose = build();
      // Let script.js repaint the curve/header through its own path again.
      window.dispatchEvent(new Event('resize'));
    }
    reduced.addEventListener('change', configure);
    compact.addEventListener('change', configure);
    configure();
  });
})();
