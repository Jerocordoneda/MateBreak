import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {load} from 'cheerio';
import {pages, headBlock} from '../scripts/seo-pages.mjs';
import {render} from '../scripts/apply-seo.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const htmlFiles = ['index.html', ...readdirSync(new URL('../src/pages/', import.meta.url)).filter(f => f.endsWith('.html')).map(f => `src/pages/${f}`)];

test('every HTML page has exactly one generated SEO block that is up to date', () => {
  assert.deepEqual(Object.keys(pages).sort(), htmlFiles.sort(), 'manifest and pages must match one to one');
  for (const file of htmlFiles) {
    const text = read(file);
    assert.equal(render(file, text), text, `${file}: run node scripts/apply-seo.mjs`);
    assert.equal(text.split('<!-- seo:start -->').length, 2, file);
    const $ = load(text);
    assert.equal($('title').length, 1, file);
    assert.equal($('meta[name="description"]').length, 1, file);
    assert.ok($('meta[name="robots"]').length <= 1, file);
    assert.ok(text.indexOf('<!-- seo:start -->') < text.indexOf('</head>'), `${file}: block belongs to <head>`);
  }
});

test('titles follow "Página · MateBreak®" (Home: "MateBreak® · Mates, termos y accesorios") and never repeat', () => {
  const titles = htmlFiles.map(file => load(read(file))('title').text());
  assert.equal(load(read('index.html'))('title').text(), 'MateBreak® · Mates, termos y accesorios');
  for (const [i, title] of titles.entries()) if (htmlFiles[i] !== 'index.html') assert.match(title, /^[^·]+ · MateBreak®$/, htmlFiles[i]);
  assert.equal(new Set(titles).size, titles.length, 'duplicate <title>');
  const descriptions = htmlFiles.map(file => load(read(file))('meta[name="description"]').attr('content'));
  assert.equal(new Set(descriptions).size, descriptions.length, 'duplicate meta description');
  for (const [i, d] of descriptions.entries()) assert.ok(d.length >= 30 && d.length <= 160, `${htmlFiles[i]}: description length ${d.length}`);
});

test('canonical and Open Graph are absolute and consistent; private screens are noindex', () => {
  for (const file of htmlFiles) {
    const $ = load(read(file)), entry = pages[file];
    assert.equal($('meta[property="og:title"]').attr('content'), $('title').text(), file);
    assert.equal($('meta[property="og:description"]').attr('content'), $('meta[name="description"]').attr('content'), file);
    assert.match($('meta[property="og:image"]').attr('content'), /^https:\/\/matebreak\.com\.ar\/src\/assets\//, file);
    const canonical = $('link[rel="canonical"]').attr('href');
    if (entry.path && !entry.robots) {
      assert.equal(canonical, `https://matebreak.com.ar${entry.path}`, file);
      assert.equal($('meta[property="og:url"]').attr('content'), canonical, file);
    } else assert.equal(canonical, undefined, `${file}: canonical is set at runtime`);
  }
  for (const file of ['src/pages/tienda.html', 'src/pages/checkout.html', 'src/pages/checkout-resultado.html', 'src/pages/cuenta.html',
    'src/pages/recuperar-cuenta.html', 'src/pages/confirmar-cuenta.html', 'src/pages/pedido.html', 'src/pages/mayorista.html'])
    assert.match(load(read(file))('meta[name="robots"]').attr('content'), /noindex/, file);
  for (const file of ['index.html', 'src/pages/podcast.html', 'src/pages/catalogo.html', 'src/pages/regalos-empresariales.html'])
    assert.equal(load(read(file))('meta[name="robots"]').length, 0, `${file} stays indexable`);
  assert.match(headBlock('index.html'), /<link rel="canonical" href="https:\/\/matebreak\.com\.ar\/">/);
});

test('runtime titles use the shared format', () => {
  assert.match(read('src/features/catalog/product-detail.js'), /setPageMeta\(\{name:p\.nombre,description:summarize\(p\.descripcion\)\|\|undefined,path:'\/productos\/'/);
  assert.match(read('src/features/cart/commerce.js'), /document\.title = pageTitle\(/);
  for (const file of ['src/features/catalog/product-detail.js', 'src/features/cart/commerce.js'])
    assert.doesNotMatch(read(file), /' · MateBreak'/, file);
});
