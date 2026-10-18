# Home mountain — local review only

Branch: `codex/home-curve-framer`, based on `ff1cf5e`. This base includes the
Motion layer from `481313d`, plus the newer unified header and SEO work. Staging
was inspected read-only and still served the older header; no deployment was made.

The reference's broad, rounded mountain and flat shoulders are recreated as an
inline local SVG in the Home. Its fill is opaque white, the upper ridge has a
2 CSS px gold stroke, and a restrained blurred ridge lies underneath the white
fill. No reference image or external asset is loaded by visitors.

The existing Motion layer, mate pose/float and 60-frame sequence are retained.
Only the curve changes: its rise is 18% of its reserved height (shared with the
fallback script), and its specular highlight follows cached samples of the SVG
ridge. The SVG fill paints over the highlight to keep the white region clean.
The height is reserved in CSS, and a white extension closes the join as the curve
rises. The header still follows the actual apex, whose local SVG y coordinate is 0.

Reduced motion disables the decorative Motion layer and curve travel using the
existing preference handling; the local white/gold SVG remains visible. Blocking
Motion retains the ordinary scroll fallback.

Validation:

- `npm run build` with the existing Staging backend-origin build variable.
- `npm test`.
- `scripts/verify-home-curve-design.mjs`: local before/after screenshots, viewport
  widths 320–1920, white join, content clearance, header contact, dynamic reduced
  motion and resize. Uses a public catalogue snapshot and read-only API fixtures.
- `scripts/verify-home-motion.mjs --dist`: existing mate/curve/continuity suite,
  updated to verify the SVG ridge instead of assuming an ellipse.
- `scripts/verify-unified-header.mjs --dist`: existing shared header regression.

Browser scripts use `MATEBREAK_BROWSER_MODULE` for an existing Playwright module.
The curve script also uses `MATEBREAK_CURVE_PROOF` (outside the checkout) and
`MATEBREAK_CATALOG_SNAPSHOT`; `--serve` starts two loopback-only review servers.
No commercial data or external service configuration is changed.
