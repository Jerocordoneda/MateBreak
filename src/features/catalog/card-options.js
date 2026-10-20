import {addCartItem} from '../cart/add-item.js';
import {resolveProductSelection} from './product-selection.mjs';
import {money} from '../../services/products.js';
const element=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function cardOptions(product,{onAdded,onCancel}){
  const form=element('form');form.className='catalog-card-options';form.setAttribute('aria-label','Elegir opciones de '+product.nombre);
  const selects=[],options=product.opciones||[],variants=product.variantes||[];
  for(const option of options){
    const label=element('label',option.nombre),select=element('select');select.name=option.nombre;select.required=true;
    select.append(new Option('Elegí una opción',''));for(const value of option.valores)select.append(new Option(value,value));
    if(option.valores.length===1)select.value=option.valores[0];
    label.append(select);form.append(label);selects.push(select);
  }
  // An incomplete catalogue must still expose an explicit variant choice,
  // rather than silently selecting a different material or price.
  let fallback;
  if(!options.length&&variants.length>1){
    const label=element('label','Variante');fallback=element('select');fallback.required=true;fallback.append(new Option('Elegí una opción',''));
    for(const v of variants)fallback.append(new Option((Object.values(v.opciones||{}).join(' · ')||'Variante '+v.id)+' — '+money(v.precio,product.moneda),v.id));
    label.append(fallback);form.append(label);
  }
  let custom;
  if(product.atributos?.personalizable_explicitamente||/personaliz|cre[aá].*dise[ñn]o/i.test(product.nombre||'')){
    const label=element('label','Personalización (opcional)');custom=element('textarea');custom.maxLength=1000;custom.rows=2;label.append(custom);form.append(label);
  }
  const price=element('p'),status=element('p'),actions=element('div'),add=element('button','Agregar al carrito'),cancel=element('button','Cancelar');
  status.setAttribute('role','status');actions.className='catalog-card-options-actions';add.type='submit';cancel.type='button';cancel.onclick=onCancel;
  actions.append(add,cancel);form.append(price,status,actions);let busy=false;
  const selected=()=>fallback?variants.find(v=>String(v.id)===fallback.value):resolveProductSelection({...product,opciones:options,variantes:variants},Object.fromEntries(selects.map(s=>[s.name,s.value]))).variant;
  const available=v=>v?.comprable&&v.con_stock&&v.precio!=null;
  function update(){const v=selected();price.textContent=v?money(v.precio,product.moneda):'Elegí las opciones para confirmar el precio';add.disabled=busy||!available(v);cancel.disabled=busy;status.textContent=v&&!available(v)?'Esta opción no está disponible.':'';}
  selects.forEach(s=>s.addEventListener('change',update));fallback?.addEventListener('change',update);
  form.addEventListener('click',e=>e.stopPropagation());
  form.onsubmit=async e=>{
    e.preventDefault();const v=selected();if(busy||!available(v))return;
    busy=true;update();status.textContent='Agregando…';form.setAttribute('aria-busy','true');
    for(const control of [...selects,fallback,custom].filter(Boolean))control.disabled=true;
    try{await addCartItem(v.id,1,custom?.value);onAdded();}
    catch(error){busy=false;for(const control of [...selects,fallback,custom].filter(Boolean))control.disabled=false;update();status.textContent=error.message;}
    finally{form.removeAttribute('aria-busy');}
  };
  update();return form;
}
