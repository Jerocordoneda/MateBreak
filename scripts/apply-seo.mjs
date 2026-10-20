// Writes the SEO block from scripts/seo-pages.mjs into every page's <head>.
//   node scripts/apply-seo.mjs          update pages in place
//   node scripts/apply-seo.mjs --check  exit 1 when a page differs (used by tests)
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pages, headBlock} from './seo-pages.mjs';

const root = resolve(import.meta.dirname, '..');

// Replaces the managed block (or, the first time, the bare <title>) and drops the
// standalone description/robots tags that the block now owns.
export function render(file, text) {
  const block = headBlock(file);
  const managed = /<!-- seo:start -->[\s\S]*?<!-- seo:end -->/;
  let out = managed.test(text) ? text.replace(managed, block) : text.replace(/<title>[^<]*<\/title>/i, block);
  if (!out.includes(block)) throw new Error(`${file}: no <title> to replace`);
  const [head, rest] = [out.slice(0, out.indexOf(block)), out.slice(out.indexOf(block) + block.length)];
  const loose = /<meta (?:name="description"|name="robots")[^>]*>\s*/gi;
  return head.replace(loose, '') + block + rest.replace(/^([\s\S]*?<\/head>)/i, part => part.replace(loose, ''));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const drift = [];
  for (const file of Object.keys(pages)) {
    const path = resolve(root, file), text = readFileSync(path, 'utf8'), next = render(file, text);
    if (next === text) continue;
    if (check) drift.push(file); else writeFileSync(path, next);
  }
  if (check && drift.length) { console.error('SEO block out of date:\n- ' + drift.join('\n- ')); process.exit(1); }
  console.log(check ? 'SEO blocks up to date' : 'SEO blocks written');
}
