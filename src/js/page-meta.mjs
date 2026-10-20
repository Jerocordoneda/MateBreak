// Shared title format and runtime metadata updates. The static per-page <head>
// blocks are generated from scripts/seo-pages.mjs, which imports these constants.
export const SITE_ORIGIN = 'https://matebreak.com.ar';
export const SITE_NAME = 'MateBreak®';
export const HOME_TITLE = `${SITE_NAME} · Mates, termos y accesorios`;
export const pageTitle = name => `${name} · ${SITE_NAME}`;

function upsert(selector, create, attribute, value) {
  let element = document.head.querySelector(selector);
  if (!element) { element = create(); document.head.append(element); }
  element.setAttribute(attribute, value);
}
const meta = (key, kind) => () => { const element = document.createElement('meta'); element.setAttribute(kind, key); return element; };

// For pages whose subject is only known at runtime (product detail, cart tabs).
export function setPageMeta({name, description, path}) {
  const title = pageTitle(name);
  document.title = title;
  upsert('meta[property="og:title"]', meta('og:title', 'property'), 'content', title);
  if (description) {
    upsert('meta[name="description"]', meta('description', 'name'), 'content', description);
    upsert('meta[property="og:description"]', meta('og:description', 'property'), 'content', description);
  }
  if (path) {
    upsert('link[rel="canonical"]', () => { const link = document.createElement('link'); link.rel = 'canonical'; return link; }, 'href', SITE_ORIGIN + path);
    upsert('meta[property="og:url"]', meta('og:url', 'property'), 'content', SITE_ORIGIN + path);
  }
}

// Plain-text summary of a product description for meta tags (max ~155 chars).
export function summarize(text, limit = 155) {
  const plain = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), limit - 20)).replace(/[\s,.;:]+$/, '') + '…';
}
