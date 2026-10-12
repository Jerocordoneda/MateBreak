import {getProducts,money} from '../../services/products.js';
import {addCartItem,directCardVariant} from '../cart/add-item.js';
export function node(tag,text,cls){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;}
export function setProductPhoto(frame,url,name){
  const placeholder=()=>{
    const label=node('span','Foto pendiente','product-photo-placeholder');
    label.setAttribute('role','img');label.setAttribute('aria-label','Foto pendiente: '+name);
    frame.replaceChildren(label);
  };
  if(typeof url!=='string'||!url.trim()){placeholder();return;}
  const img=node('img');img.alt=name;img.loading='lazy';img.width=480;img.height=600;
  img.addEventListener('error',()=>{if(frame.contains(img))placeholder();},{once:true});
  img.src=url;frame.replaceChildren(img);
}
export function productCard(p) {
  const card=node('article',null,'catalog-card'),link=node('a',null,'catalog-image');link.href='/productos/'+encodeURIComponent(p.slug);
  setProductPhoto(link,p.imagen_principal,p.nombre);
  card.append(link);
  const text=node('div',null,'catalog-card-body'),title=node('a',null,'catalog-title');title.href=link.href;title.append(node('h3',p.nombre));
  const category=p.categorias.at(-1)?.nombre;text.append(node('span',category||'', 'eyebrow'),title);
  text.append(node('p',p.descripcion||category||'','catalog-description'));
  const variant=directCardVariant(p), price=variant?.precio??p.precio, original=variant?.precio_original??p.precio_original;
  if(original>price)text.append(node('del',money(original,p.moneda),'catalog-old'));
  const row=node('div',null,'catalog-purchase'),add=node('button','+','catalog-add'),status=node('p','','catalog-feedback');
  status.setAttribute('role','status');add.type='button';
  const unavailable=p.disponible===false||(variant&&(!variant.comprable||!variant.con_stock||variant.precio==null));
  add.disabled=Boolean(unavailable);
  add.setAttribute('aria-label',(variant?'Agregar al carrito: ':'Elegir opciones: ')+p.nombre);
  row.append(node('strong',money(price,p.moneda),'catalog-price'),add);
  if(p.descuento>0)text.append(node('span',`${Math.round(p.descuento)}% OFF`,'catalog-discount'));
  if(p.disponible===false)text.append(node('p','Sin stock','stock-warning'));
  text.append(row,status);card.append(text);
  let busy=false;
  add.addEventListener('click',async event=>{
    event.preventDefault();event.stopPropagation();if(busy||unavailable)return;
    if(!variant){location.assign(link.href);return;}
    busy=true;add.disabled=true;add.setAttribute('aria-busy','true');status.textContent='Agregando…';
    try{await addCartItem(variant.id);add.textContent='✓';status.textContent='Agregado al carrito';}
    catch(error){status.textContent=error.message;}
    finally{busy=false;add.disabled=false;add.removeAttribute('aria-busy');}
  });
  card.addEventListener('click',event=>{
    if(!event.target.closest('a,button')&&!window.getSelection()?.toString())location.assign(link.href);
  });
  return card;
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
      grid.replaceChildren(...list.map(productCard));
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
