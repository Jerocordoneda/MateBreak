import {getProducts,money} from '../../services/products.js';
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
  pricing.append(node('strong',(p.precio_desde?'Desde ':'')+money(price,p.moneda),'catalog-price'));
  text.append(pricing);
  if(p.disponible===false)text.append(node('p','Sin stock','stock-warning'));
  // Always select options on the canonical detail; never choose an arbitrary
  // model/bombilla or write a cart from a listing card.
  const more=node('a','+','catalog-card-action');more.href=link.href;more.setAttribute('aria-label','Elegir opciones de '+p.nombre);text.append(more);card.append(text);return card;
}
export async function mountCatalog(container,{category='',search='',featured=false,limit=null,filters=true}={}){
  container.replaceChildren(node('p','Cargando catálogo…'));
  try {
    const all=await getProducts(),categories=[...new Map(all.flatMap(p=>p.categorias).map(c=>[c.slug,c])).values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
    const grid=node('div',null,'catalog-grid'),status=node('p',null,'catalog-results');status.setAttribute('aria-live','polite');
    container.replaceChildren();let select,input;
    if(filters){
      const controls=node('div',null,'catalog-controls');const searchLabel=node('label','Buscá tu próximo mate');input=node('input');input.type='search';input.placeholder='Producto, equipo, material…';input.value=search;searchLabel.append(input);
      const categoryLabel=node('label','Categoría');select=node('select');select.append(new Option('Todo el catálogo',''));categories.forEach(c=>select.append(new Option(c.nombre,c.slug)));select.value=category;categoryLabel.append(select);controls.append(searchLabel,categoryLabel);container.append(controls);
    }
    container.append(status,grid);
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
        }else grid.append(node('p','No encontramos productos con esos filtros.'));
      }
    }
    if(input)input.oninput=render;if(select)select.onchange=render;render();
  }catch(e){container.replaceChildren(node('p',e.message));const retry=node('button','Reintentar','button-secondary');retry.onclick=()=>mountCatalog(container,{category,search,featured,limit,filters});container.append(retry);}
}
