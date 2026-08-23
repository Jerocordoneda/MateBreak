import fs from 'fs';
import path from 'path';

const root = process.cwd();
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'tools') continue;
      walk(p);
    } else if (e.name.endsWith('.html')) files.push(p);
  }
}
walk(root);

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function norm(s) {
  return decode(s).replace(/\s+/g, ' ').trim();
}

const results = new Map(); // string -> { count, files:Set }
const titles = new Map();
let totalNodes = 0;

for (const f of files) {
  let html = fs.readFileSync(f, 'utf8');
  // title
  const tm = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (tm) {
    const t = norm(tm[1]);
    if (t && !titles.has(t)) titles.set(t, f);
  }
  html = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/i, '');
  // split into text segments between tags
  const parts = html.split(/<[^>]*>/);
  for (const raw of parts) {
    const s = norm(raw);
    if (!s) continue;
    totalNodes++;
    if (!results.has(s)) results.set(s, { count: 0, files: new Set() });
    const r = results.get(s);
    r.count++;
    r.files.add(path.relative(root, f));
  }
  // placeholders
  for (const m of html.matchAll(/placeholder="([^"]*)"/g)) {
    const s = norm(m[1]);
    if (s && !results.has(s)) results.set(s, { count: 0, files: new Set() });
  }
}

// filters
function isIconLigature(s) { return /^[a-z]+(_[a-z]+)*$/.test(s); }
function hasLetters(s) { return /[a-záéíóúñüA-ZÁÉÍÓÚÑÜ]/i.test(s); }
function isPriceOrNum(s) { return /^[\d\s.,$%°ºº°ARSUSD-]+$/.test(s); }

const kept = [];
const skipped = [];
for (const [s, meta] of results) {
  if (!hasLetters(s) || isPriceOrNum(s) || isIconLigature(s) || s.length <= 2) { skipped.push(s); continue; }
  kept.push([s, meta.count, [...meta.files].length]);
}

kept.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

fs.mkdirSync(path.join(root, 'src', 'i18n'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'src', 'i18n', 'es-source.json'),
  JSON.stringify(kept.map(k => k[0]), null, 2),
  'utf8'
);

console.log('Files scanned:', files.length);
console.log('Total text nodes:', totalNodes);
console.log('Unique raw strings:', results.size);
console.log('Kept for translation:', kept.length);
console.log('Skipped (icons/numbers/symbols):', skipped.length);
console.log('Unique titles:', titles.size);
