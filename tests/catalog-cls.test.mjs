import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const ui = read('src/features/catalog/catalog-ui.js'), page = read('src/pages/catalogo.html');
const css = read('src/css/catalog.css'), brand = read('src/css/site-brand.css');

test('the catalogue page ships its loading skeleton in the HTML (first paint already has the final shape)', () => {
  const card = '<article class="catalog-card catalog-card-skeleton" aria-hidden="true"><span class="catalog-image"></span><div class="catalog-card-body"><div class="catalog-title"><h3>&nbsp;</h3></div><p class="catalog-description">&nbsp;</p><div class="catalog-card-footer"><div class="catalog-card-pricing"><del class="catalog-old">&nbsp;</del><strong class="catalog-price">&nbsp;</strong></div><span class="catalog-card-action"></span></div><span class="catalog-card-feedback"></span></div></article>';
  assert.ok(page.includes('<div data-catalog="all" data-category="" data-search="" aria-busy="true"><div class="catalog-controls"><label>Buscá tu próximo mate<input type="search" placeholder="Producto, equipo, material…"></label><label>Categoría<select disabled><option value="">Todo el catálogo</option></select></label></div><p class="catalog-results" aria-live="polite">Cargando catálogo…</p><div class="catalog-grid">' + card.repeat(6) + '</div></div>'));
});

test('the script builds the same skeleton for every catalogue mount and keeps controls in place', () => {
  // Same element tree as the static markup above.
  assert.match(ui, /node\('article',null,'catalog-card catalog-card-skeleton'\);card\.setAttribute\('aria-hidden','true'\)/);
  assert.match(ui, /pricing\.append\(node\('del',NBSP,'catalog-old'\),node\('strong',NBSP,'catalog-price'\)\)/);
  assert.match(ui, /const NBSP='\\u00a0';/);
  assert.match(ui, /catalogShell\(container,\{category,search,filters,count:limit\|\|6\}\)/);
  assert.match(ui, /container\.setAttribute\('aria-busy','true'\)/);
  assert.match(ui, /select\.disabled=true/);
  assert.match(ui, /input\.value=typed\|\|search/);
  // Empty and error states replace only the grid; the error is announced.
  assert.match(ui, /Todavía no hay productos en el catálogo\./);
  assert.match(ui, /message\.setAttribute\('role','alert'\)/);
  assert.match(ui, /grid\.replaceChildren\(state\)/);
});

test('skeleton cards are never interactive and only shimmer when motion is allowed', () => {
  assert.match(css, /\.catalog-card-skeleton\{cursor:default;pointer-events:none;\}/);
  const motion = css.indexOf('@media(prefers-reduced-motion:no-preference){.catalog-card-skeleton');
  assert.ok(motion > 0);
  assert.doesNotMatch(css.slice(0, motion), /catalog-shimmer/);
  assert.match(css.slice(motion), /transform:translateX\(-100%\);animation:catalog-shimmer/);
});

test('commerce pages reserve the shared header band before it mounts', () => {
  assert.match(brand, /body\[data-brand-shell="commerce"\]:not\(\.mb-public-simple\)\{padding-top:129px\}/);
  assert.match(brand, /@media\(max-width:760px\)\{body\[data-brand-shell="commerce"\]:not\(\.mb-public-simple\)\{padding-top:64px\}/);
  assert.match(brand, /main>\.commerce-sections :is\(\[data-cart-link\],\[data-account-link\],\.mb-podcast-link\)\{display:none\}/);
  // The values match the mounted header (public-header.css).
  const header = read('src/css/public-header.css');
  assert.match(header, /\.mb-public-simple \{padding-top:129px;\}/);
  assert.match(header, /\.mb-page-shortcuts \{display:flex;gap:16px;align-items:center;margin-block:12px;font-size:12px;\}/);
});
