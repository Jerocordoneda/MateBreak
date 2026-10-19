import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {pages} from '../scripts/seo-pages.mjs';
import {renderSitemap, sitemapUrls} from '../scripts/build-sitemap.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const htmlPages = ['index.html', ...readdirSync(new URL('../src/pages/', import.meta.url)).filter(f => f.endsWith('.html')).map(f => `src/pages/${f}`)];
const ICONS = ['arrow_forward', 'credit_card', 'expand_more', 'local_shipping', 'mail', 'sell', 'share'];

test('robots.txt is valid, points to the sitemap and never hides the noindex screens', () => {
  const robots = read('robots.txt');
  for (const line of robots.split('\n').filter(l => l && !l.startsWith('#')))
    assert.match(line, /^(User-agent: \*|Allow: \/|Disallow: \/(api|auth|interno)\/|Sitemap: https:\/\/matebreak\.com\.ar\/sitemap\.xml)$/, line);
  for (const path of ['/carrito', '/checkout', '/mi-cuenta', '/src/pages/']) assert.ok(!robots.includes(`Disallow: ${path}`));
});

test('sitemap.xml lists every indexable page and catalogue product, and no private screen', () => {
  assert.equal(read('sitemap.xml'), renderSitemap());
  const urls = sitemapUrls();
  // Legacy redirect stubs share /tienda with the catalogue: a path is listed when
  // any page served there is indexable.
  const paths = new Set(Object.values(pages).filter(page => page.path).map(page => page.path));
  for (const path of paths) {
    const indexable = Object.values(pages).some(page => page.path === path && !page.robots);
    assert.equal(urls.includes('https://matebreak.com.ar' + path), indexable, path);
  }
  for (const path of ['/carrito', '/checkout', '/mi-cuenta', '/mayorista', '/src/pages/pedido.html']) assert.ok(!urls.includes('https://matebreak.com.ar' + path), path);
  assert.equal(urls.filter(url => url.includes('/productos/')).length, 106);
  assert.equal(new Set(urls).size, urls.length);
});

test('the build copies only the two crawler files to the root and the audit allows exactly them', () => {
  assert.match(read('scripts/build-frontend.mjs'), /for\(const name of \['robots\.txt','sitemap\.xml'\]\)if\(existsSync/);
  assert.match(read('scripts/audit-guest-artifact.mjs'), /\['index\.html','robots\.txt','sitemap\.xml'\]\.includes\(name\)\|\|name\.startsWith\('src\/'\)/);
});

test('every page declares Spanish', () => {
  for (const file of htmlPages) assert.match(read(file), /<html lang="es"/, file);
});

test('Material Symbols downloads only the icons the site uses, and every used icon is in that set', () => {
  const used = new Set();
  for (const file of [...htmlPages, 'src/js/header-navigation.mjs', 'src/js/responsive-header.mjs']) {
    const text = read(file);
    for (const [, name] of text.matchAll(/material-symbols-outlined[^>]*>([a-z_]+)</g)) used.add(name);
    for (const href of text.match(/https:\/\/fonts\.googleapis\.com\/css2\?family=Material[^"]*/g) || [])
      assert.equal(href, `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;icon_names=${ICONS.join(',')}&amp;display=swap`, file);
  }
  for (const name of used) assert.ok(ICONS.includes(name), `icon ${name} missing from icon_names`);
});

// Lazy loading the Home corporate photos was measured on public Staging: they
// arrived mid-scroll and grew their unsized grid (CLS up to 0.19 on phones). As
// WebP the four weigh ~45 KB, so they load with the page again.
test('heavy photos ship as WebP; the Home corporate photos are sized and load with the page', () => {
  const home = read('index.html');
  for (const file of htmlPages) assert.doesNotMatch(read(file), /recortes\/foto-\d\.png|TU EMPRESA\.png/, file);
  const tiles = home.match(/<img[^>]*recortes\/foto-\d\.webp[^>]*>/g);
  assert.equal(tiles.length, 4);
  for (const tile of tiles) { assert.match(tile, /width="\d+" height="\d+" decoding="async">/); assert.doesNotMatch(tile, /loading="lazy"/); }
  assert.match(home, /data-seq-img src="src\/assets\/images\/frames-mate1\/ezgif-frame-001-removebg-preview\.webp" fetchpriority="high">/);
  assert.match(read('src/pages/regalos-empresariales.html'), /src="\/src\/assets\/imagenes\/matebreak-tu-empresa\.webp" width="900" height="600" decoding="async">/);
  for (const image of ['recortes/foto-1.webp', 'recortes/foto-3.webp', 'recortes/foto-5.webp', 'recortes/foto-6.webp', 'matebreak-tu-empresa.webp'])
    assert.ok(existsSync(new URL(`../src/assets/imagenes/${image}`, import.meta.url)), image);
});

// Deferring the clips until after load was measured on public Staging: their
// download then overlapped the mate photograph sequence (frames lagged, CLS rose).
// The carousel keeps loading clip metadata with the page.
test('carousel clips keep loading their metadata with the page', () => {
  const carousel = read('src/js/video-carousel.js');
  assert.match(carousel, /video\.src = cfg\.items\[i\]\.url;/);
  assert.match(carousel, /video\.preload = "metadata";/);
});

test('every carousel clip has its own poster, so the cards behind are never blank', () => {
  const carousel = read('src/js/video-carousel.js');
  const posters = [...carousel.matchAll(/poster: "(src\/assets\/videos\/posters\/clip-\d\.webp)"/g)].map(m => m[1]);
  assert.deepEqual(posters, [0, 1, 2, 3].map(i => `src/assets/videos/posters/clip-${i}.webp`));
  for (const poster of posters) assert.ok(existsSync(new URL(`../${poster}`, import.meta.url)), poster);
});
