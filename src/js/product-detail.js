import {getProductBySlug,money} from '../services/products.js';
import {node} from './catalog-ui.js';
const root=document.querySelector('#product-content');
async function init(){
  try{
    const slug=decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1));
    const p=await getProductBySlug(slug);if(!p){root.replaceChildren(node('h1','Producto no encontrado'));return;}
    document.title=p.nombre+' · MateBreak';
    const crumbs=node('nav',null,'product-breadcrumb');crumbs.setAttribute('aria-label','Ubicación');const back=node('a','← Todo el catálogo');back.href='/tienda';crumbs.append(back);
    for(const c of p.categorias){const a=node('a',c.nombre);a.href='/tienda?categoria='+encodeURIComponent(c.slug);crumbs.append(node('span','/'),a);}
    const layout=node('div',null,'product-detail'),gallery=node('div'),hero=node('img',null,'product-gallery-main'),thumbs=node('div',null,'product-thumbnails');hero.alt=p.nombre;
    const galleryImages=p.imagenes.filter(i=>i.rol!=='descripcion');
    const buttons=[];
    const showImage=url=>{hero.src=url;buttons.forEach(({button,image})=>button.setAttribute('aria-pressed',String(image.url===url)));};
    for(const [index,image] of galleryImages.entries()){
      const button=node('button'),img=node('img');button.type='button';button.setAttribute('aria-label',`Ver imagen ${index+1}`);img.src=image.url;img.alt=image.alt||p.nombre;img.loading='lazy';button.append(img);button.onclick=()=>showImage(image.url);thumbs.append(button);buttons.push({button,image});
    }
    if(galleryImages.length)showImage(galleryImages[0].url);gallery.append(hero,thumbs);
    const info=node('div',null,'product-info');info.append(node('p',p.tipo==='combo'?'PARA COMPARTIR':'PARA TU RITUAL','eyebrow'),node('h1',p.nombre));
    const pricing=node('div',null,'product-pricing'),form=node('form',null,'product-options'),selects=[];
    for(const option of p.opciones){const label=node('label',option.nombre),select=node('select');select.name=option.nombre;
      select.append(new Option('Seleccioná una opción',''));for(const value of option.valores)select.append(new Option(value,value));select.required=true;label.append(select);form.append(label);selects.push(select);}
    let custom;
    if(p.atributos?.personalizable_explicitamente){const label=node('label','Indicaciones para tu personalización (opcional)');custom=node('textarea');custom.maxLength=1000;custom.rows=3;custom.placeholder='Nombres, frases o indicaciones de grabado';label.append(custom);form.append(label);}
    const availability=node('p'),quantityLabel=node('label','Cantidad'),quantity=node('input'),button=node('button','Agregar al carrito +','button-primary'),buyNow=node('button','Comprar ahora →','button-secondary'),status=node('p');status.setAttribute('role','status');
    button.type='submit';buyNow.type='submit';
    quantity.type='number';quantity.min='1';quantity.max='99';quantity.step='1';quantity.value='1';quantity.required=true;quantityLabel.append(quantity);
    const cartLink=node('a','Ver mi carrito →','text-link');cartLink.href='/carrito';
    const selectedVariant=()=>selects.some(s=>!s.value)?null:p.variantes.find(v=>selects.every(s=>v.opciones[s.name]===s.value));
    function update(){
      const v=selectedVariant(),price=v?.precio??p.precio,original=v?.precio_original??p.precio_original;
      pricing.replaceChildren();if(original>price)pricing.append(node('del',money(original,p.moneda),'catalog-old'),node('span',`${Math.round((1-price/original)*100)}% OFF`,'catalog-discount'));
      pricing.append(node('strong',money(price,p.moneda),'catalog-price'));
      pricing.append(node('p','10% de descuento por transferencia en checkout','catalog-transfer'));
      pricing.append(node('p','Cuotas según disponibilidad de Mercado Pago'));
      pricing.append(node('p','Envío gratis desde $80.000','catalog-shipping'));
      for(const promotion of p.promociones)if(promotion!=='Envío gratis'&&!/transferencia|cuotas/i.test(promotion))pricing.append(node('p',promotion,'catalog-transfer'));
      availability.textContent=!v?'Elegí las opciones para ver disponibilidad.':!v.comprable?'Disponible por consulta: estamos vinculando su stock.':v.con_stock?'Disponible':'Sin stock';
      button.disabled=!v||!v.comprable||!v.con_stock||v.precio==null;
      buyNow.disabled=button.disabled;
      if(v?.imagen)showImage(v.imagen);
    }
    selects.forEach(s=>s.onchange=update);form.append(availability,quantityLabel,button,buyNow,status,cartLink);info.append(pricing,form);
    form.onsubmit=async event=>{
      event.preventDefault();const direct=event.submitter===buyNow,v=selectedVariant(),units=Number(quantity.value);if(!v||!Number.isInteger(units)||units<1||units>99)return;button.disabled=true;buyNow.disabled=true;status.textContent=direct?'Preparando checkout…':'Guardando…';
      try{
        if(direct){
          const response=await fetch('/api/compra-directa',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({variante_id:v.id,cantidad:units,personalizacion:custom?.value||''})});
          const result=await response.json();if(!response.ok)throw Error(result.error||'No pudimos iniciar la compra');
          location.assign(result.next);return;
        }
        const current=await fetch('/api/carrito',{credentials:'same-origin'});if(!current.ok)throw Error('No se pudo recuperar el carrito');const cart=await current.json();
        const old=cart.items.find(i=>i.variante_id===v.id);
        const response=await fetch('/api/carrito/variantes/'+v.id,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({cantidad:(old?.cantidad||0)+units,...(custom?{personalizacion:custom.value}:{})})});
        const result=await response.json();if(!response.ok)throw Error(result.error||'No pudimos agregar el producto');
        window.dispatchEvent(new CustomEvent('mb:cart',{detail:result.items.reduce((n,i)=>n+i.cantidad,0)}));status.textContent='Producto agregado. Tu selección está guardada.';
      }catch(e){status.textContent=e.message;}finally{update();}
    };
    layout.append(gallery,info);
    const copy=node('section',null,'product-copy');copy.append(node('h2','Cada detalle cuenta'),node('p',p.descripcion||'','product-description'));
    const descImages=node('div',null,'product-description-images');for(const image of p.imagenes.filter(i=>i.rol==='descripcion')){const img=node('img');img.src=image.url;img.alt=image.alt||p.nombre;img.loading='lazy';descImages.append(img);}copy.append(descImages);
    if(p.componentes.length){const details=node('details'),list=node('ul');details.append(node('summary','Qué incluye este set'));p.componentes.forEach(c=>list.append(node('li',c.evidencia)));details.append(list);copy.append(details);}
    root.replaceChildren(crumbs,layout,copy);update();
  }catch(e){root.replaceChildren(node('p',e.message));}
}
init();
