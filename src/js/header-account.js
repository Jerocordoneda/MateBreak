import {mountPageBrand} from './site-brand.js';
mountPageBrand();
const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/src/css/header-account.css'; document.head.append(style);
const svg = path => { const icon = document.createElementNS('http://www.w3.org/2000/svg','svg'); icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('aria-hidden','true'); const shape = document.createElementNS(icon.namespaceURI,'path'); shape.setAttribute('d',path); icon.append(shape); return icon; };
const cartIcon = () => svg('M3 3h2l2.5 12h11L21 6H6 M10 20h.01 M18 20h.01');
const userIcon = () => svg('M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2');
const cartLinks = [...document.querySelectorAll('[data-cart-link]')];
for (const icon of document.querySelectorAll('header a .material-symbols-outlined')) if (icon.textContent.trim() === 'shopping_cart') cartLinks.push(icon.closest('a'));
for (const link of new Set(cartLinks)) {
  link.href = '/tienda#carrito'; link.classList.add('mb-cart-link'); link.dataset.cartLink = '';
  const count = document.createElement('span'); if (link.querySelector('#cart-count')) count.id = 'cart-count'; count.className = 'mb-cart-count'; count.dataset.cartBadge = ''; count.textContent = '0'; count.setAttribute('aria-hidden','true');
  link.replaceChildren(cartIcon(),count); link.setAttribute('aria-label','Mi carrito, 0 unidades');
  let account = link.parentElement.querySelector('[data-account-link]');
  if (!account) { account = document.createElement('a'); account.dataset.accountLink = ''; link.after(account); }
  account.href = '/mi-cuenta'; account.classList.add('mb-account-link'); account.setAttribute('aria-label','Mi cuenta');
  const label = document.createElement('span'); label.textContent = 'Mi cuenta'; account.replaceChildren(userIcon(),label);
  link.parentElement.classList.add('mb-header-actions');
  const header=link.closest('header');
  if(header&&!header.classList.contains('site-header')){
    header.classList.add('mb-commerce-header');const bar=link.parentElement.parentElement;bar.classList.add('mb-mainbar');
    bar.querySelector('a')?.classList.add('mb-brand-link');const help=bar.querySelector('nav');help?.classList.add('mb-help-nav');
    for(const nav of header.querySelectorAll('nav'))if(nav!==help){nav.classList.add('mb-category-nav');nav.parentElement.classList.add('mb-categorybar');}
  }
}
let channel, quantity = -1, refreshing = false;
try { channel = new BroadcastChannel('matebreak-carrito'); } catch { /* Reload on focus when unsupported. */ }
function paint(count) {
  if (!Number.isSafeInteger(count) || count < 0) return;
  quantity = count;
  for (const badge of document.querySelectorAll('[data-cart-badge]')) badge.textContent = String(count);
  for (const link of document.querySelectorAll('[data-cart-link]')) link.setAttribute('aria-label',`Mi carrito, ${count} ${count === 1 ? 'unidad' : 'unidades'}`);
}
window.addEventListener('mb:cart',event => { if (event.detail !== quantity) { paint(event.detail); channel?.postMessage(event.detail); } });
if (channel) channel.onmessage = event => { paint(event.data); };
async function refresh() {
  if (refreshing) return; refreshing = true;
  try { const response = await fetch('/api/carrito/resumen',{credentials:'same-origin',cache:'no-store'}); if (response.ok) { const data = await response.json(); paint(data.cantidad); } }
  catch { /* Keep the last known count while offline. */ }
  finally { refreshing = false; }
}
window.addEventListener('pageshow',refresh);
document.addEventListener('visibilitychange',() => { if (!document.hidden) refresh(); });
refresh();
