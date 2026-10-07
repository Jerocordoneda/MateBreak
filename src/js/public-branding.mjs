import {brandLogo as mateBreakLogo}from'./site-brand.js';
export {mateBreakLogo};
export function mountPublicBranding(root=document){
 if(!root.querySelector('.mb-brand-link,.mb-site-brand,header > a.brand')){
  const main=root.querySelector('main');if(!main)return;
  const link=root.createElement('a');link.href='/';link.className='mb-site-brand mb-page-brand';link.setAttribute('aria-label','MateBreak, inicio');
  const img=root.createElement('img');img.src=mateBreakLogo;img.alt='';img.width=48;img.height=48;
  const name=root.createElement('span');name.textContent='MateBreak®';link.append(img,name);main.prepend(link);
  // Old text-only auth branding is superseded by the shared accessible brand.
  for(const child of main.children)if(child!==link&&child.tagName==='A'&&child.textContent.trim()==='MateBreak®')child.remove();
 }
}
