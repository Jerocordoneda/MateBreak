import {brandMarkup} from './site-brand.js';
import {categoryMarkup,helpMarkup} from './header-navigation.mjs';
import {mountResponsiveHeader} from './responsive-header.mjs';

const cartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3h2l2.5 12h11L21 6H6 M10 20h.01 M18 20h.01"></path></svg>';
const accountIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2"></path></svg>';

// Move existing links rather than cloning them or initializing commerce/auth again.
// The approved Home's menu is mounted once, with the same responsive behavior.
export function mountPublicHeader(root = document) {
  if (root.querySelector('.mb-public-header')) return;
  const team = root.body.hasAttribute('data-team-shell');
  let cart = root.querySelector('[data-cart-link]');
  const account = root.querySelector('[data-account-link]');
  const brand = root.querySelector('.mb-brand-link,.mb-site-brand,header > a.brand');
  if(team&&!cart){cart=root.createElement('a');cart.href='/carrito';cart.dataset.cartLink='';cart.setAttribute('aria-label','Mi carrito');const badge=root.createElement('span');badge.dataset.cartBadge='';badge.textContent='0';cart.append(badge);}
  if (!cart || !account || !brand) return;
  const marketing = root.querySelector('.mb-commerce-header');
  const oldHeader = brand.closest('header');
  const oldActions = cart.closest('.mb-header-actions') || cart.closest('nav') || (team&&account.closest('.header-actions'));
  const header = marketing || root.createElement('header');
  header.classList.add('mb-public-header');
  header.classList.remove('header-dark');
  const bar = marketing?.querySelector('.mb-mainbar') || root.createElement('div');
  bar.classList.add('mb-public-mainbar');
  brand.className = 'mb-site-brand mb-public-brand';
  brand.setAttribute('aria-label', 'MateBreak, inicio');
  brand.innerHTML = brandMarkup;
  if(team){const label=root.createElement('small');label.className='mb-team-label';label.textContent='ESPACIO DEL EQUIPO';brand.append(label);}
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
  // Secondary page shortcuts stay in the content, while the two header rows
  // always use the approved Home navigation.
  extras.querySelector('.mb-menu-toggle')?.remove();
  for(const link of [...extras.querySelectorAll('a')]){
    if(link.classList.contains('mb-podcast-link'))link.remove();
  }
  if(extras.childElementCount){extras.className='mb-page-shortcuts';root.querySelector('main')?.prepend(extras);}
  const search=root.createElement('button');search.type='button';search.className='mb-search-toggle';search.setAttribute('aria-label','Buscar productos');search.setAttribute('aria-haspopup','dialog');
  search.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 5 5"></path></svg>';
  search.addEventListener('click',async()=>{
    if(search.disabled)return;search.disabled=true;
    try{const {openGlobalSearch}=await import('./global-search.mjs');openGlobalSearch(search,root);}
    catch{search.setAttribute('aria-label','Buscar productos; no se pudo abrir, volvé a intentar');}
    finally{search.disabled=false;}
  });
  actions.append(search,cart, account);
  let help=header.querySelector('.mb-help-nav');
  if(!help){help=root.createElement('nav');help.className='mb-help-nav';help.innerHTML=helpMarkup;}
  help.setAttribute('aria-label','Información');
  const brandWrapper = brand.parentElement;
  bar.prepend(brand);
  bar.append(help);
  bar.append(actions);
  if (marketing && brandWrapper !== bar && !brandWrapper.childElementCount && !brandWrapper.textContent.trim()) brandWrapper.remove();
  oldActions?.remove();
  if(marketing&&bar.parentElement!==header){const wrapper=bar.parentElement;header.prepend(bar);wrapper.remove();}
  if (!marketing) {
    header.append(bar);
    root.body.prepend(header);
    root.body.classList.add('mb-public-simple');
    oldHeader?.remove();
  }
  let categoryBar=header.querySelector('.mb-categorybar');
  if(!categoryBar){categoryBar=root.createElement('div');categoryBar.className='mb-categorybar';header.append(categoryBar);}
  const navigation=root.createElement('nav');navigation.className='mb-category-nav';navigation.setAttribute('aria-label','Colecciones');navigation.innerHTML=categoryMarkup;categoryBar.replaceChildren(navigation);
  header.classList.add('mb-commerce-header');
  mountResponsiveHeader(root);
  const toggle=actions.querySelector('.mb-menu-toggle');if(toggle)actions.prepend(toggle);
}

// Label the already-authorized team screen; this does not grant access or roles.
export function setTeamHeader(team,root=document){
  root.body.toggleAttribute('data-team-shell',team);
  const brand=root.querySelector('.mb-public-brand');if(!brand)return;
  brand.querySelector('.mb-team-label')?.remove();
  if(team){const label=root.createElement('small');label.className='mb-team-label';label.textContent='ESPACIO DEL EQUIPO';brand.append(label);}
}
