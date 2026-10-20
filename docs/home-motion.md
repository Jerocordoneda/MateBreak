# Home motion layer (Motion 14.3.0)

Branch `warp/home-motion`, based on the stable recovery point `9cd2fcf`
(tag `stable/frontend-recovery-9cd2fcf`). Nothing is published; Staging and
Production are untouched. No backend, database, checkout or other component changes.

## What changed for the visitor

- **Mate:** the 60-photograph scroll sequence, preload cache and drag/keyboard
  exploration are unchanged (`scroll-sequence.js`). On top of it the mate's wrapper
  gets a spring-smoothed pose linked to scroll (parallax lift, tilt, breathing
  scale) and the photograph floats at rest through a compositor-run animation.
  Mobile, which previously showed a single static frame, now has the same pose and
  a smaller float.
- **Golden curve:** geometry, travel (0.65 × height), easing and the header contact
  logic are unchanged. The rise is now spring-smoothed; a halo swells as the arc
  crosses the viewport, and a small specular glint travels along the arc's own
  ellipse (radii are read from the curve's CSS). Only `transform` and `opacity` change
  per frame, so the large curve layer is not repainted.
- **Header:** still driven by `header-fade.js`. The Motion layer dispatches the
  existing `mb:transition` event after each rendered curve position, so the
  dark → light switch happens exactly when the rendered apex reaches the header.

## `prefers-reduced-motion: reduce`

Only the scroll-linked photograph sequence remains (it follows the visitor's own
scrolling). There is no float, parallax, spring, halo or glint, and no curve travel
(as before). Turning the preference on or off while the page is open tears down or
rebuilds the layer without a reload. The former CSS rule that forced the float under
reduced motion on desktop was removed.

## Why the previous Motion attempt (`1597b0f`) failed

Measured in Chrome against `9cd2fcf` and `1597b0f` (`scripts/verify-home-motion.mjs`
covers the new behaviour):

| | float at rest | frames at scroll 0 / 350 / 700 |
|---|---|---|
| `9cd2fcf`, normal motion | yes | 29 → 48 → 60 |
| `1597b0f`, normal motion | **no** (`animation: none !important` in `home-motion.css`) | 29 → 48 → 60 |
| `1597b0f`, reduced motion | **no** | **1 → 1 → 1** (sequence disabled for everyone preferring reduced motion) |

The machine used for development reports `prefers-reduced-motion: reduce`
(Windows animations off), so that case is what a tester there would see.

## How it is built

- `src/js/vendor/motion-14.3.0.js` is the official vanilla browser bundle from the
  pinned `motion` package (`devDependencies`, exact version, `--ignore-scripts`), with
  its MIT license. It is vendored so the static Vercel build needs no extra step and
  never reaches the Render backend. `tests/home-motion.test.mjs` fails if the file
  differs from the locked package. To update: bump the package, copy
  `node_modules/motion/dist/motion.js` over the vendored file, review the diff.
- `src/js/home-motion.js` loads `defer` after the bundle, only on Home, and does
  nothing when Motion is missing or reduced motion is requested. `script.js` yields
  the Home curve only while the layer is active (`data-mb-home-motion` on `<html>`),
  so the original path remains the fallback for every other situation.
- 154 KB raw / 51 KB gzip, Home only. No React, CDN or bundler.
- `motion-ai` was reviewed but not used: it installs AI-agent skills and hosted MCP
  connections, not browser animation code.

## Verification

- `node --test tests/home-motion.test.mjs` (contracts and behaviour with a fake DOM).
- `node scripts/verify-home-motion.mjs [--dist]` drives real Chrome at 1440, 1024,
  768, 390 and 320 px, with and without reduced motion, with Motion blocked, and with
  a live preference switch. It checks pose/curve/glint movement during scroll, header
  contact, per-frame continuity, layout shift, horizontal overflow and the arc's
  curvature. It uses a throwaway local server and a stubbed API; it never touches
  Supabase, payments or any remote service. Set `MATEBREAK_BROWSER_MODULE` to a
  Playwright `index.mjs` when it is not installed, `MATEBREAK_MOTION_PROOF` for
  screenshots.

## Reverting

List the commits with `git log --oneline 9cd2fcf..warp/home-motion`. Each one can be
`git revert`ed on its own; reverting all of them, newest first, restores `9cd2fcf`.
