# Home mountain — local review only

Branch: `codex/home-curve-framer`, based on `ff1cf5e`. This base includes the
Motion layer from `481313d`, plus the newer unified header and SEO work. The
candidate is local only; no deployment was made.

The reference's broad, rounded mountain and flat shoulders are recreated as an
inline local SVG in the Home. Its fill is opaque white, the upper ridge has a
2 CSS px gold stroke, and a restrained blurred ridge lies underneath the white
fill. No reference image or external asset is loaded by visitors.

The existing Motion layer, mate pose/float and 60-frame sequence are retained.
The curve begins almost flat at its lower edge and grows upward into the reference
mountain as the visitor scrolls. A shared SVG transform scales the ridge and fill
around their lower baseline; the gold stroke retains its thickness. Smoothstep
easing follows Motion's existing spring and reverses naturally when scrolling back.
The 18% vertical travel remains shared with the fallback script. The highlight
follows cached ridge samples adjusted to the current wave height. The SVG fill
paints over the highlight to keep the white region clean.
The height is reserved in CSS; a fixed white base and extension close the join as
the curve rises. A marker tracks the moving apex so the existing header theme
still changes at contact with the white surface, without changing its design.

Reduced motion disables the decorative Motion layer and curve travel using the
existing preference handling; the complete white/gold mountain remains static.
Blocking Motion retains the same wave through the ordinary scroll fallback.

Validation:

- `npm run build` with the existing Staging backend-origin build variable.
- `npm test`: 357 passed.
- `scripts/verify-home-curve-design.mjs`: local before/after screenshots, viewport
  widths 320–1920, white join, content clearance, header contact, dynamic reduced
  motion and resize. Uses a public catalogue snapshot and read-only API fixtures.
- `scripts/verify-home-motion.mjs --dist`: existing mate/curve/continuity suite,
  updated to verify the changing SVG ridge, growth from flat to full mountain and
  a static full mountain under reduced motion instead of assuming an ellipse.
- `scripts/verify-unified-header.mjs --dist`: existing shared header regression.

Browser scripts use `MATEBREAK_BROWSER_MODULE` for an existing Playwright module.
The curve script also uses `MATEBREAK_CURVE_PROOF` (outside the checkout) and
`MATEBREAK_CATALOG_SNAPSHOT`; `--serve` starts two loopback-only review servers.
No commercial data or external service configuration is changed.

## Integration on `warp/home-mountain` (Claude)

Astra's two commits (`c517814`, `7a25a9f`, both on `ff1cf5e`) were cherry-picked
unchanged (`-x`); they only touch the Home transition. On top of them:

- **Closer sections.** The transition box's upper part is empty space reserved
  for the rising wave, so it now overlaps the benefits section's bottom padding.
  Only the clearance the risen apex needs remains:
  `calc(22px + clamp(21px, 3.52vw, 62px))` (73 px at 1440, 84 px at 1920, 43 px
  on phones; previously 235/270/100 px).
- **The swell starts as the transition enters the viewport** (`start = .06`), so
  the white crest rises into view under the benefits instead of after a long empty
  band. It still reaches the full mountain at the same point.
- **Organic crest.** The swell starts up to 6% broader and gathers into the
  mountain as it rises; the ridge glow follows the swell (opacity .45 → 1). Both
  end on the exact mountain and full glow, which is also the static reduced-motion
  state. One shared painter (`script.js`) serves Motion and the fallback.
- **Livelier spring for the swell only.** Motion drives the wave with its own
  slightly underdamped spring (damping ratio ~0.7): it settles with a soft
  overshoot (0.5–8%, browser-checked) and eases back when scrolling up. The curve
  travel, which the header contact follows, keeps its calmer spring.
- The glint maps the crest's spread, so it stays on the ridge.

`scripts/verify-home-mountain.mjs` checks spacing, content clearance while the
wave rises (≥ 8 px), progressive rise and return, crest/glow, spring settle, the
white join, header contact, reduced motion and the Motion-less fallback at 320–1920
px. `verify-home-curve-design.mjs` now asserts that clearance instead of
"no box overlap", because the overlap of the empty padding is intentional.

## Polish on `warp/home-mountain-polish` (from `43af699`)

- **Height: at most 8 cm on screen** at 100% zoom (CSS `cm`, 37.8 px): the box is
  `min(clamp(210px, 35.2vw, 620px), 8.45cm)` and the mountain is 640/676 of it.
  It used to reach 15.5 cm at 1920 px and 12.7 cm at 1440 px; phones are unchanged
  (~5.3 cm). The clearance above the box follows the capped height.
- **Phone proportions on every screen.** On a 390 px phone the stretched viewBox
  makes the bell 1.53× steeper than the artwork; wider boxes now narrow the bell to
  that same steepness and flat gold shoulders fill the width. Phones keep their
  exact shape.
- **Later start:** the swell begins once the transition is ~22% into the viewport.
- **Natural wave.** The swell's own spring is softer (≈7 rad/s, damping ≈0.7): it
  rises in ~0.3 s, overshoots slightly and settles in under a second, and undoes
  itself the same way on the way back. While it moves it leans with its speed
  (Motion's spring velocity) and straightens as it settles.
- **Glow:** two soft layers (a close luminous edge and a wide diffuse halo) in a
  brighter gold; the fixed white base reaches below the baseline so the halo never
  shows under it. The glint still travels the ridge, sized to the smaller bell.
- Reduced motion: the static mountain (same proportions and height), full glow,
  no lean, travel or decorative layers.

`scripts/verify-home-mountain.mjs` adds the 8 cm cap, phone steepness at every
width, the late start, and lean only while moving.

## v3 on `warp/home-mountain-v3` (from `d7d8e4c`)

- **Phones start the swell 3.5 cm of scroll earlier** (CSS cm): it begins once the
  transition is `max(0, 22% of the viewport − 3.5cm)` inside it (54 px on an 844 px
  phone instead of 186 px). Tablets and desktop keep ~22%.
- **Wider bell on tablets/desktop:** steepness target .9 instead of the phone's
  1.53, so the 8 cm mountain is ~1000 px across (full width on tablets). Phones
  keep their shape.
- **Reduced motion now shows the rise.** Like the mate's photograph sequence, the
  wave follows the visitor's own scrolling and undoes on the way back; there is
  no spring, lean, crest morph, curve travel, glint/halo or glow change. (The
  development PC reports `prefers-reduced-motion: reduce` because Windows
  animations are off, which is why the rise was not visible there.)
