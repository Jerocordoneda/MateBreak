# Home motion — Staging

The Home header starts at the same `#131313` as the hero. Scroll increases
translucency/blur over the first 180 px; the existing curve/header contact still
chooses the light palette, now with a 360 ms color transition. Other pages keep
their existing header treatment.

Motion 14.3.0 owns Home scroll observation and native transform/opacity
animations. Desktop keeps the approved 60 photographs and bounded decoded
cache; mobile keeps one photograph with a subtle scroll-linked pose. The golden
curve keeps its geometry/travel and gains a seven-second opacity highlight.
That highlight pauses offscreen and in background tabs. Reduced motion, including
changes while the page is open, removes pose/glow animations, frame preloading
and curve travel. The previous CSS exception that ignored this preference was
removed.

## Dependency review

Reviewed npm metadata, lifecycle scripts, CLI entrypoint and installer modules
before execution. Motion is pinned in package-lock.json and installed with
`--ignore-scripts`. Its official self-contained vanilla browser distribution is
copied by `npm run build:motion` (also part of frontend build and predev/prestart).
Only Home loads it; 154,394 bytes raw / 51,770 gzip. No React, CDN, bundler or new
remote connection is needed. The generated asset and MIT license are ignored in
source control and reproduced from the locked dependency.

`motion-ai@14.2.0` was installed separately in the local evidence directory with
scripts disabled. After reviewing its CLI and installer, `npx --no-install
motion-ai --help` was evaluated there. It installs agent skills and hosted MCP
connections, rather than browser animation code. Those integrations were not
needed for this change; no global agent settings or Motion+ account were added.

## Verification

`npm test`, `npm run build`, `tests/public-header-browser.mjs --dist`, and
`scripts/verify-home-motion.mjs` cover the change. Browser scripts use an existing
Playwright installation via `MATEBREAK_BROWSER_MODULE`, with evidence outside
the checkout. Motion verification also needs `MATEBREAK_MOTION_PROOF` and a
public `MATEBREAK_CATALOG_SNAPSHOT`; optional `MATEBREAK_MOTION_URL` tests the
published site and `MATEBREAK_MOTION_WIDTHS` selects comma-separated widths.

The browser checks real Motion/scroll/WAAPI, decoded images, reverse scrolling,
resize, overflow, dynamic and initial reduced motion, continuous glow, and layout
shift during animated scrolling. Commerce fixtures only provide read data;
verification never writes sales, stock, payments or customer data.

Deployment scope is the separate `matebreak-staging` Vercel project. No backend
or database changes are required.
