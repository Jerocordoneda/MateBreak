// Writes sitemap.xml from the SEO manifest (indexable pages only) and the frozen
// public-store catalog snapshot (product URLs). Offline: no database or API.
//   node scripts/build-sitemap.mjs          write sitemap.xml
//   node scripts/build-sitemap.mjs --check  exit 1 when sitemap.xml is out of date (used by tests)
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {pages, SITE_ORIGIN} from './seo-pages.mjs';

const root = resolve(import.meta.dirname, '..');
const target = resolve(root, 'sitemap.xml');

export function sitemapUrls() {
  // Private screens carry robots and no canonical path; they never belong here.
  const listed = Object.values(pages).filter(page => page.path && !page.robots).map(page => page.path);
  const catalog = JSON.parse(readFileSync(resolve(root, 'supabase/catalog/20260928-public-store.json'), 'utf8'));
  const products = catalog.map(product => product.slug).sort().map(slug => `/productos/${encodeURIComponent(slug)}`);
  return [...new Set([...listed, ...products])].map(path => SITE_ORIGIN + path);
}

export function renderSitemap() {
  const entries = sitemapUrls().map(url => `  <url><loc>${url.replaceAll('&', '&amp;')}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const next = renderSitemap();
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8').replaceAll('\r\n', '\n') !== next) { console.error('sitemap.xml out of date: run node scripts/build-sitemap.mjs'); process.exit(1); }
    console.log('sitemap.xml up to date');
  } else { writeFileSync(target, next); console.log(`sitemap.xml written (${sitemapUrls().length} URLs)`); }
}
