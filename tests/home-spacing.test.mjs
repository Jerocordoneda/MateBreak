import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

test('Home: the Instagram call, the video carousel and the FAQ sit close together', () => {
  const home = read('index.html'), css = read('src/css/responsive.css'), carousel = read('src/js/video-carousel.js');
  assert.match(home, /<section class="w-full bg-white pb-section-gap-lg pt-8" data-home-community>/);
  assert.match(home, /<section class="py-section-gap-lg w-full bg-white" data-home-faq>/);
  assert.match(css, /\[data-home\] \[data-home-community\] \{ padding-bottom: clamp\(16px, 2\.5vw, 32px\); \}/);
  assert.match(css, /\[data-home\] \[data-home-community\] > div > \.text-center \{ margin-bottom: clamp\(16px, 2vw, 28px\); \}/);
  assert.match(css, /\[data-home\] \[data-home-faq\] \{ padding-top: clamp\(32px, 4\.5vw, 64px\); \}/);
  // The carousel box only keeps room for the hover zoom, not the old 3D-depth band.
  assert.match(carousel, /var clusterH = Math\.ceil\(ch \* cfg\.hoverZoom\) \+ 12;/);
});
