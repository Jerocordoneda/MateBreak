import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

test('Cart: "Volver" returns to Home and each item shows its product photo', () => {
  assert.match(read('src/pages/tienda.html'), /<a href="\/" class="mb-back-link" aria-label="Volver al inicio">/);
  const cart = read('src/features/cart/commerce.js');
  assert.match(cart, /import \{money as formatMoney, getProducts, getProductBySlug\} from '\.\.\/\.\.\/services\/products\.js';/);
  // Variant photo first, then the product's main photo; the icon stays when there is none or it fails.
  assert.match(cart, /if \(variant\?\.imagen\) return variant\.imagen;\n\s*\}\n\s*return card\.imagen_principal \|\| null;/);
  assert.match(cart, /\}\)\(\)\.catch\(\(\) => null\)\);/);
  assert.match(cart, /img\.alt = '';/, 'the name is already next to the photo');
  assert.match(cart, /symbol\.append\(icon\('mate'\)\); showPhoto\(symbol, item\);/);
  assert.match(read('src/css/commerce.css'), /\.product-symbol img\{display:block;width:100%;height:100%;object-fit:contain\}/);
});
