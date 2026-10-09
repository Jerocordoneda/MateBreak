import {mountPublicBranding} from './public-branding.mjs';
import {mountPublicHeader} from './public-header.mjs';
mountPublicBranding();
mountPublicHeader();
// Enhance navigation separately; commerce state continues through the existing cart module.
let channel, quantity = -1, refreshing = false, revision = 0;
try { channel = new BroadcastChannel('matebreak-carrito'); } catch { /* Reload on focus when unsupported. */ }
function paint(count) {
  if (!Number.isSafeInteger(count) || count < 0) return;
  quantity = count;
  revision++;
  for (const badge of document.querySelectorAll('[data-cart-badge]')) badge.textContent = String(count);
  for (const link of document.querySelectorAll('[data-cart-link]')) link.setAttribute('aria-label',`Mi carrito, ${count} ${count === 1 ? 'unidad' : 'unidades'}`);
}
window.addEventListener('mb:cart',event => { if (event.detail !== quantity) { paint(event.detail); channel?.postMessage(event.detail); } });
if (channel) channel.onmessage = event => { paint(event.data); };
async function refresh() {
  if (refreshing) return; refreshing = true;
  const requestedRevision = revision;
  try { const response = await fetch('/api/carrito/resumen',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)}); if (response.ok) { const data = await response.json(); if (revision === requestedRevision) paint(data.cantidad); } }
  catch { /* Keep the last known count while offline. */ }
  finally { refreshing = false; }
}
window.addEventListener('pageshow',refresh);
document.addEventListener('visibilitychange',() => { if (!document.hidden) refresh(); });
refresh();
