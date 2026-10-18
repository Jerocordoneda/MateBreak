import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const htmlFiles = ['index.html', ...readdirSync(new URL('../src/pages/', import.meta.url)).filter(f => f.endsWith('.html')).map(f => `src/pages/${f}`)];

test('one header surface for every page (Podcast reference); Home keeps its own', () => {
  const css = read('src/css/public-header.css').replaceAll('\r\n', '\n');
  const surface = css.match(/header\.mb-public-header \{\n[\s\S]*?\n\}/)[0];
  assert.ok(surface.includes('--mb-header-tint: 19, 19, 19;'), 'dark default tint');
  assert.ok(surface.includes('rgba(var(--mb-header-tint), 0) 100%'), 'surface fades out below the navigation');
  assert.ok(surface.includes('box-shadow: none;') && !/#171815|backdrop-filter/.test(surface), 'no solid band, hard shadow or full-header blur');
  assert.match(css, /header\.mb-public-header::before \{[^}]*backdrop-filter: blur\(16px\);[^}]*mask-image: linear-gradient\(to bottom, #000 80%, transparent 100%\);/);
  assert.match(read('src/js/header-fade.js'), /header\.style\.setProperty\('--mb-header-tint'/);
  assert.doesNotMatch(css, /header\.mb-public-header \{ backdrop-filter: blur\(24px\); \}/);
  assert.match(css, /\.mb-help-nav a \{color:inherit;text-decoration:none;\}/);
  assert.match(read('src/css/home-header.css'), /\[data-home\] > header\.mb-public-header::before \{ content: none; \}/);
  assert.match(read('src/js/header-account.js'), /import '\.\/header-fade\.js';/);
  assert.match(read('src/js/header-fade.js'), /if \(window\.mbHeaderTheme\) return;/);
  for (const file of htmlFiles) {
    const text = read(file);
    assert.doesNotMatch(text, /header-fade\.js|header-fade-blur/, `${file}: header theme is loaded centrally`);
    if (/<script[^>]+header-account\.js/.test(text)) continue;
    assert.match(text, /http-equiv="refresh"/, `${file}: every non-redirect page mounts the shared header`);
  }
  assert.doesNotMatch(read('src/css/style.css'), /\.header-fade-blur/);
});
