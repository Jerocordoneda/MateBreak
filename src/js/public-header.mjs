import {brandMarkup} from './site-brand.js';

const cartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3h2l2.5 12h11L21 6H6 M10 20h.01 M18 20h.01"></path></svg>';
const accountIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2"></path></svg>';

// Move existing links rather than cloning them or initializing commerce/auth again.
// The category menu and its responsive listeners stay on their original header.
export function mountPublicHeader(root = document) {
  if (root.querySelector('.mb-public-header')) return;
  const cart = root.querySelector('[data-cart-link]');
  const account = root.querySelector('[data-account-link]');
  const brand = root.querySelector('.mb-brand-link,.mb-site-brand,header > a.brand');
  if (!cart || !account || !brand) return;
  const marketing = root.querySelector('.mb-commerce-header');
  const oldHeader = brand.closest('header');
  const oldActions = cart.closest('.mb-header-actions') || cart.closest('nav');
  const header = marketing || root.createElement('header');
  header.classList.add('mb-public-header');
  const bar = marketing?.querySelector('.mb-mainbar') || root.createElement('div');
  bar.classList.add('mb-public-mainbar');
  brand.className = 'mb-site-brand mb-public-brand';
  brand.setAttribute('aria-label', 'MateBreak, inicio');
  brand.innerHTML = brandMarkup;
  const actions = root.createElement('nav');
  actions.className = 'mb-header-actions mb-public-actions';
  actions.setAttribute('aria-label', 'Mi compra');
  const extras = root.createElement('div');
  extras.className = 'mb-public-extras';
  const links = new Set([...(oldActions?.querySelectorAll('a,button') || []),
    ...(!marketing && oldHeader ? oldHeader.querySelectorAll('nav a') : [])]);
  for (const link of links) if (link !== cart && link !== account) extras.append(link);
  const menuToggle = extras.querySelector('.mb-menu-toggle');
  if (menuToggle) extras.prepend(menuToggle);
  const badge = cart.querySelector('[data-cart-badge]');
  cart.classList.add('mb-cart-link');
  cart.innerHTML = cartIcon;
  if (badge) { badge.className = 'mb-cart-count'; badge.setAttribute('aria-hidden','true'); cart.append(badge); }
  account.classList.add('mb-account-link');
  account.innerHTML = accountIcon;
  account.setAttribute('aria-label', 'Mi cuenta');
  actions.append(extras, cart, account);
  const brandWrapper = brand.parentElement;
  bar.prepend(brand);
  bar.append(actions);
  if (marketing && brandWrapper !== bar && !brandWrapper.childElementCount && !brandWrapper.textContent.trim()) brandWrapper.remove();
  oldActions?.remove();
  if (!marketing) {
    header.append(bar);
    root.body.prepend(header);
    root.body.classList.add('mb-public-simple');
    oldHeader?.remove();
  }
}
