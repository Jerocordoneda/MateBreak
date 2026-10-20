import {getProducts} from '../services/products.js';
import {node,productCard} from '../features/catalog/catalog-ui.js';
import {searchCatalog} from '../features/catalog/search-model.mjs';

let instance;
export function openGlobalSearch(trigger,root=document){
  if(!instance){
    const dialog=root.createElement('dialog');dialog.className='mb-search-dialog';dialog.setAttribute('aria-labelledby','mb-search-title');
    const heading=node('div',null,'mb-search-heading'),title=node('h2','Encontrá tu próximo ritual');title.id='mb-search-title';
    const close=node('button','×','mb-search-close');close.type='button';close.setAttribute('aria-label','Cerrar búsqueda');
    heading.append(title,close);
    const label=node('label','Buscar productos','mb-search-label'),input=node('input');input.type='search';input.placeholder='Nombre, categoría, material…';input.autocomplete='off';input.maxLength=120;input.setAttribute('aria-describedby','mb-search-status');label.append(input);
    const status=node('p','Buscá por nombre, categoría o material.','mb-search-status');status.id='mb-search-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const results=node('div',null,'catalog-grid mb-search-results'),browse=node('a','Ver todo el catálogo →','mb-search-browse');browse.href='/tienda';
    dialog.append(heading,label,status,results,browse);root.body.append(dialog);
    // Search is imported only on demand. Reuse the same card CSS on screens
    // which do not otherwise need a catalogue stylesheet.
    if(!root.querySelector('link[href="/src/css/catalog.css"]')){const css=root.createElement('link');css.rel='stylesheet';css.href='/src/css/catalog.css';root.head.append(css);}
    let revision=0,timer,opener;
    async function render(){
      const own=++revision,query=input.value.trim();
      results.replaceChildren();
      if(!query){status.textContent='Buscá por nombre, categoría o material.';return;}
      status.textContent='Buscando…';results.setAttribute('aria-busy','true');
      try{
        const products=await getProducts();
        if(own!==revision||!dialog.open)return;
        const matches=searchCatalog(products,query);
        status.textContent=matches.length?`${matches.length} productos${matches.length>12?' · mostrando los primeros 12':''}`:'No encontramos productos. Probá con otro nombre o material.';
        results.replaceChildren(...matches.slice(0,12).map((p,index)=>productCard(p,{eager:index<2})));
      }catch{
        if(own!==revision||!dialog.open)return;
        status.textContent='No pudimos cargar los productos. Intentá nuevamente.';
        const retry=node('button','Reintentar','button-secondary');retry.type='button';retry.onclick=render;results.append(retry);
      }finally{if(own===revision)results.removeAttribute('aria-busy');}
    }
    input.addEventListener('input',()=>{clearTimeout(timer);revision++;results.removeAttribute('aria-busy');timer=setTimeout(render,120);});
    input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(timer);render();}});
    close.onclick=()=>dialog.close();
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();dialog.close();return;}
      if(event.key!=='Tab')return;
      const focusable=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href]')].filter(e=>e.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if((event.shiftKey&&root.activeElement===first)||(!event.shiftKey&&root.activeElement===last)){
        event.preventDefault();(event.shiftKey?last:first)?.focus();
      }
    });
    dialog.addEventListener('close',()=>{clearTimeout(timer);revision++;results.removeAttribute('aria-busy');opener?.focus();});
    instance={open(button){opener=button;if(!dialog.open)dialog.showModal();input.focus();render();}};
  }
  instance.open(trigger);
}
