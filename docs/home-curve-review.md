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
