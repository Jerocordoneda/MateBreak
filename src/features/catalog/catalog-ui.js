import {getProducts,getProductBySlug,money} from '../../services/products.js';
import {addCartItem,directCardVariant} from '../cart/add-item.js';
import {cardOptions} from './card-options.js';
export function node(tag,text,cls){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;}
export function setProductPhoto(frame,url,name,{eager=false}={}){
  const placeholder=()=>{
    const label=node('span','Foto pendiente','product-photo-placeholder');
    label.setAttribute('role','img');label.setAttribute('aria-label','Foto pendiente: '+name);
    frame.replaceChildren(label);frame.removeAttribute('aria-busy');
  };
  if(typeof url!=='string'||!url.trim()){placeholder();return;}
  const img=node('img');img.alt=name;img.loading=eager?'eager':'lazy';img.decoding='async';img.width=480;img.height=600;
  if(eager){frame.setAttribute('aria-busy','true');img.addEventListener('load',()=>{if(frame.contains(img))frame.removeAttribute('aria-busy');},{once:true});}
  img.addEventListener('error',()=>{if(frame.contains(img))placeholder();},{once:true});
  img.src=url;frame.replaceChildren(img);
}
export function productCard(p,{eager=false}={}) {
  const card=node('article',null,'catalog-card'),link=node('a',null,'catalog-image');link.href='/productos/'+encodeURIComponent(p.slug);
  setProductPhoto(link,p.imagen_principal,p.nombre,{eager});
  card.append(link);
  const text=node('div',null,'catalog-card-body'),title=node('a',null,'catalog-title');title.href=link.href;title.append(node('h3',p.nombre));
  const category=p.categorias?.at(-1)?.nombre;
  text.append(title);
  // Catalogue descriptions are text, never executable markup. Keep commercial
  // terms in the detail/checkout rather than inventing badges on these cards.
  const description=String(p.descripcion||category||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  text.append(node('p',description.slice(0,180),'catalog-description'));
  const price=p.precio_card??p.precio,original=p.precio_card!=null?p.precio_card_original:p.precio_original;
  const pricing=node('div',null,'catalog-card-pricing');
  if(original>price)pricing.append(node('del',money(original,p.moneda),'catalog-old'));
  pricing.append(node('strong',money(price,p.moneda),'catalog-price'));
  const footer=node('div',null,'catalog-card-footer');footer.append(pricing);text.append(footer);
  if(p.disponible===false)text.append(node('p','Sin stock','stock-warning'));
  // Cards use a lightweight DTO. Inspect the canonical detail before choosing
  // a single variant; configurable products retain their selection flow.
  const more=node('button','+','catalog-card-action');more.type='button';more.setAttribute('aria-label','Agregar o elegir opciones de '+p.nombre);
  const feedback=node('span',null,'catalog-card-feedback');feedback.setAttribute('role','status');
  let busy=false,panel;
  if(p.disponible===false){more.disabled=true;more.setAttribute('aria-disabled','true');}
  more.onclick=async event=>{
    event.preventDefault();event.stopPropagation();if(busy||p.disponible===false)return;
    if(panel){panel.querySelector('select,textarea,button')?.focus();return;}
    busy=true;more.disabled=true;more.setAttribute('aria-busy','true');more.setAttribute('aria-disabled','true');feedback.textContent='Consultando producto…';
    try{
      const product=await getProductBySlug(p.slug),variant=directCardVariant(product);
      if(!product)throw Error('Producto no disponible.');
      if(!variant){
        const close=()=>{panel?.remove();panel=null;more.removeAttribute('aria-expanded');more.focus();};
        panel=cardOptions(product,{onAdded:()=>{close();feedback.textContent='Agregado al carrito';},onCancel:()=>{close();feedback.textContent='';}});
        more.setAttribute('aria-expanded','true');text.append(panel);feedback.textContent='';panel.querySelector('select,textarea,button')?.focus();return;
      }
      if(!variant.comprable||!variant.con_stock||variant.precio==null)throw Error('Producto no disponible para agregar.');
      await addCartItem(variant.id);feedback.textContent='Agregado al carrito';
    }catch(error){feedback.textContent=error.message;}
    finally{busy=false;more.disabled=p.disponible===false;more.removeAttribute('aria-busy');more.removeAttribute('aria-disabled');}
  };
  footer.append(more);text.append(feedback);card.append(text);
  card.addEventListener('click',event=>{if(event.target.closest('a,button,input,select,textarea,label,form')||window.getSelection()?.toString())return;location.assign(link.href);});
  return card;
}
// Loading placeholders reuse the real card classes, so they measure exactly like
// the products that replace them: nothing moves when the API answers (CLS).
// Most products show a crossed-out price, which sets the row height; so does the
// placeholder's.
// Non-breaking spaces keep each line its real height without placeholder text.
const NBSP='\u00a0';
export function skeletonCard(){
  const card=node('article',null,'catalog-card catalog-card-skeleton');card.setAttribute('aria-hidden','true');
  const body=node('div',null,'catalog-card-body'),title=node('div',null,'catalog-title');title.append(node('h3',NBSP));
  const footer=node('div',null,'catalog-card-footer'),pricing=node('div',null,'catalog-card-pricing');
  pricing.append(node('del',NBSP,'catalog-old'),node('strong',NBSP,'catalog-price'));
  footer.append(pricing,node('span',null,'catalog-card-action'));
  body.append(title,node('p',NBSP,'catalog-description'),footer,node('span',null,'catalog-card-feedback'));
  card.append(node('span',null,'catalog-image'),body);
  return card;
}
// Controls, status and grid exist from the first frame; only their contents
// change when the products arrive. A search typed meanwhile is kept.
function catalogShell(container,{category,search,filters,count}){
  const typed=container.querySelector('.catalog-controls input')?.value;
  let input,select,controls;
  if(filters){
    controls=node('div',null,'catalog-controls');const searchLabel=node('label','Buscá tu próximo mate');input=node('input');input.type='search';input.placeholder='Producto, equipo, material…';input.value=typed||search;searchLabel.append(input);
    const categoryLabel=node('label','Categoría');select=node('select');select.append(new Option('Todo el catálogo',''));select.disabled=true;select.dataset.category=category;categoryLabel.append(select);controls.append(searchLabel,categoryLabel);
  }
  const status=node('p','Cargando catálogo…','catalog-results');status.setAttribute('aria-live','polite');
  const grid=node('div',null,'catalog-grid');grid.append(...Array.from({length:count},skeletonCard));
  container.setAttribute('aria-busy','true');
  container.replaceChildren(...(controls?[controls]:[]),status,grid);
  return {input,select,status,grid};
}
export async function mountCatalog(container,{category='',search='',featured=false,limit=null,filters=true}={}){
  const {input,select,status,grid}=catalogShell(container,{category,search,filters,count:limit||6});
  try {
    const all=await getProducts(),categories=[...new Map(all.flatMap(p=>p.categorias).map(c=>[c.slug,c])).values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    if(select){categories.forEach(c=>select.append(new Option(c.nombre,c.slug)));select.value=category;select.disabled=false;}
    container.removeAttribute('aria-busy');
    const normalize=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
    function render(){
      const term=normalize(input?.value??search),cat=select?.value??category;
      let list=all.filter(p=>(!featured||p.destacado)&&(!cat||p.categorias.some(c=>c.slug===cat))&&normalize(p.nombre+' '+(p.descripcion||'')).includes(term));
      status.textContent=`${list.length} productos`;if(limit)list=list.slice(0,limit);
      grid.replaceChildren(...list.map((p,index)=>productCard(p,{eager:!featured&&index<2})));
      if(!list.length){
        if(featured){
          const empty=node('div',null,'catalog-empty');
          const browse=node('a','Ver catálogo','text-link');browse.href='/tienda';
          empty.append(node('p','Todavía no hay productos destacados.'),browse);grid.append(empty);
        }else{
          const empty=node('div',null,'catalog-empty');
          empty.append(node('p',all.length?'No encontramos productos con esos filtros.':'Todavía no hay productos en el catálogo.'));grid.append(empty);
        }
      }
    }
    if(input)input.oninput=render;if(select)select.onchange=render;render();
  }catch(e){
    // The error takes the grid's place; the controls stay where they were.
    container.removeAttribute('aria-busy');status.textContent='';
    const state=node('div',null,'catalog-empty catalog-error'),message=node('p',e.message||'No pudimos cargar el catálogo.');message.setAttribute('role','alert');
    const retry=node('button','Reintentar','button-secondary');retry.type='button';
    retry.onclick=()=>mountCatalog(container,{category:select?.dataset.category??category,search:input?.value??search,featured,limit,filters});
    state.append(message,retry);grid.replaceChildren(state);
  }
}
