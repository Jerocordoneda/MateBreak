import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {pages} from '../scripts/seo-pages.mjs';
import {helpMarkup} from '../src/js/header-navigation.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const help = read('src/pages/ayuda.html'), about = read('src/pages/nosotros.html');

test('Ayuda exists, is indexed with its own title and the header links to it', () => {
  assert.equal(pages['src/pages/ayuda.html'].name, 'Ayuda');
  assert.match(help, /<title>Ayuda · MateBreak®<\/title>/);
  assert.match(helpMarkup, /<a href="\/src\/pages\/ayuda\.html">AYUDA<\/a>/);
  assert.match(helpMarkup, /<a href="\/src\/pages\/faqs\.html">FAQ<small>S<\/small><\/a>/);
});

test('Ayuda and Nosotros share the header, the layout stylesheet and the footer', () => {
  for (const page of [help, about]) {
    assert.match(page, /^<!DOCTYPE html>\n<html lang="es">/);
    assert.match(page, /<script type="module" src="\/src\/js\/header-account\.js"><\/script>/);
    assert.match(page, /<link rel="stylesheet" href="\/src\/css\/info-pages\.css">/);
    assert.match(page, /<body data-marketing class="mb-info /);
    assert.match(page, /<header class="[^"]*mb-commerce-header">/);
    assert.match(page, /<section class="mb-info-hero[^"]*"/);
    assert.match(page, /<div class="mb-info-band">/);
    assert.match(page, /<footer class="mb-info-footer">/);
  }
});

test('Ayuda: searchable questions grouped by topic, and a way to reach a person', () => {
  assert.match(help, /<script type="module" src="\/src\/js\/help-center\.js"><\/script>/);
  assert.match(help, /<form class="mb-help-search" role="search" data-help-search>/);
  assert.match(read('src/css/info-pages.css'), /\.mb-help-search:not\(\.is-ready\) \{ visibility: hidden; \}/);
  assert.match(help, /role="status" aria-live="polite" data-help-status/);
  const topics = [...help.matchAll(/<a class="mb-info-card" href="#([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(topics, ['envios', 'pagos', 'personalizacion', 'cambios', 'empresas', 'cuenta']);
  for (const id of topics) assert.match(help, new RegExp(`<div class="mb-faq-group" id="${id}" data-help-group>`));
  assert.equal(help.match(/<details class="mb-faq">/g).length, 12);
  assert.match(help, /href="https:\/\/wa\.me\/542266487305"/);
  assert.match(help, /href="https:\/\/instagram\.com\/matebreak\.arg"/);
  assert.match(help, /href="\/src\/pages\/faqs\.html"/);
});

test('Nosotros keeps its title and typography, its texts, and uses only local photos', () => {
  assert.match(about, /<h1 id="about-title" class="font-display-lg text-display-lg text-on-surface uppercase tracking-tighter [^"]*">Somos MateBreak®<\/h1>/);
  for (const text of ['Elevando el ritual. Artesanía, precisión y pasión por nuestra tierra en cada detalle.', 'El Origen del Ritual',
    'MateBreak nació de una necesidad profunda', 'Nuestra Filosofía', 'Calidad Inconmensurable', 'Diseño de Precisión', 'Comunidad'])
    assert.ok(about.includes(text), text);
  for (const page of [help, about]) {
    assert.doesNotMatch(page, /googleusercontent|aida-public|data-alt=/);
    for (const [, src] of page.matchAll(/<img[^>]+src="(\/[^"]+)"/g)) assert.ok(existsSync(new URL(`..${src}`, import.meta.url)), src);
    for (const [, alt] of page.matchAll(/<img[^>]+alt="([^"]*)"/g)) assert.ok(alt.length > 0);
  }
});

test('Ayuda and Nosotros motion stays behind prefers-reduced-motion', () => {
  const css = read('src/css/info-pages.css');
  const motion = css.slice(css.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.ok(motion.length > 0);
  assert.doesNotMatch(css.slice(0, css.indexOf('@media (prefers-reduced-motion: no-preference)')), /animation|transition/);
});
