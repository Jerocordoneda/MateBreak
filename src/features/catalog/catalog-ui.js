import {getProducts,money} from '../../services/products.js';
export function node(tag,text,cls){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;}
export function productCard(p) {
  const card=node('article',null,'catalog-card'),link=node('a',null,'catalog-image');link.href='/productos/'+encodeURIComponent(p.slug);
  if(p.imagen_principal){const img=node('img');img.src=p.imagen_principal;img.alt=p.nombre;img.loading='lazy';img.width=480;img.height=600;link.append(img);}
  card.append(link);
  const text=node('div',null,'catalog-card-body'),title=node('a',null,'catalog-title');title.href=link.href;title.append(node('h3',p.nombre));
  const category=p.categorias.at(-1)?.nombre;text.append(node('span',category||'', 'eyebrow'),title);
  if(p.precio_original>p.precio)text.append(node('del',money(p.precio_original,p.moneda),'catalog-old'));
  text.append(node('strong',money(p.precio,p.moneda),'catalog-price'));
  if(p.descuento>0)text.append(node('span',`${Math.round(p.descuento)}% OFF`,'catalog-discount'));
  text.append(node('p','10% de descuento por transferencia en checkout','catalog-transfer'));
  text.append(node('p','Cuotas según disponibilidad de Mercado Pago','catalog-installments'));
  text.append(node('p','Envío gratis desde $80.000','catalog-shipping'));
  if(p.disponible===false)text.append(node('p','Sin stock','stock-warning'));
  const more=node('a','Elegir opciones →','button-secondary');more.href=link.href;text.append(more);card.append(text);return card;
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
      grid.replaceChildren(...list.map(productCard));if(!list.length)grid.append(node('p','No encontramos productos con esos filtros.'));
    }
    if(input)input.oninput=render;if(select)select.onchange=render;render();
  }catch(e){container.replaceChildren(node('p',e.message));const retry=node('button','Reintentar','button-secondary');retry.onclick=()=>mountCatalog(container,{category,search,featured,limit,filters});container.append(retry);}
}
