import {applyDefaults,applyAddress} from './autofill.mjs';
import {quantity} from './quantity.mjs';
const $=s=>document.querySelector(s),money=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
async function api(path,data){const r=await fetch('/api/mayorista/'+path,{method:data?'POST':'GET',credentials:'same-origin',headers:{...(data?{'Content-Type':'application/json'}:{}),...(accountId?{'X-MateBreak-Account':accountId}:{})},...(data?{body:JSON.stringify(data)}:{})});const body=await r.json();if(r.status===401){invalidate();throw Object.assign(Error('Tu sesión venció. Volvé a ingresar.'),{status:401});}if(!r.ok)throw Object.assign(Error(body.error||'No pudimos consultar el servidor'),{status:r.status});return body;}
let quoteTimer;let reviewAll=false;let catalog,quote,revision=0,key,payload,saved=false,busy=false,accountId,profileRevision=0,addresses=[];const dirty=new Set();const selected=new Map();
function invalidate(){clearTimeout(quoteTimer);reviewAll=false;revision++;profileRevision++;catalog=null;quote=null;selected.clear();addresses=[];dirty.clear();$('#wholesale-private').hidden=true;$('#wholesale-catalog').replaceChildren();$('#wholesale-lines').replaceChildren();$('#wholesale-form').reset();$('#wholesale-message').value='';payload=null;$('#wholesale-history-list').replaceChildren();location.replace('/mi-cuenta?volver=mayorista');}
const status=text=>$('#wholesale-status').textContent=text;
function controls(){const ready=!!quote?.eligible&&!!catalog?.contactReady&&!saved&&!busy;$('#wholesale-continue').disabled=!ready;$('#wholesale-submit').disabled=!ready;}
function renderQuote(data){quote=data;$('#wholesale-tier').value=String(data.tier);paintPrices(data);$('#wholesale-tier-current').textContent='Tramo aplicado: '+(data.tier>=100?'100+':data.tier>=50?'50–99':'10–49')+' unidades · '+(data.benefit||'Grabado + packaging de regalo');$('#wholesale-lines').replaceChildren(...data.items.map(i=>{const p=node('p',`${i.quantity} × ${i.name} · ${money.format(i.unitPrice)} c/u · ${money.format(i.subtotal)}`);p.className='wholesale-line';return p;}));$('#wholesale-total').textContent=money.format(data.total);$('#wholesale-progress').max=data.minimum;$('#wholesale-progress').value=Math.min(data.units,data.minimum);$('#wholesale-minimum').textContent=`${data.units} unidades elegibles. ${data.remaining?'Faltan '+data.remaining+' para continuar.':'Mínimo alcanzado.'}`;controls();}
function items(){return [...selected].map(([id,cantidad])=>({id,cantidad})).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);}
async function refresh(){const current=++revision;quote=null;controls();$('#wholesale-total').textContent='—';if([...$('#wholesale-catalog').querySelectorAll('input')].some(input=>quantity(input.value)===null||input.validity.badInput)){status('Revisá la cantidad');return;}if(!selected.size){$('#wholesale-tier').value='10';paintPrices();$('#wholesale-tier-current').textContent='Precios base · 10–49 unidades';$('#wholesale-lines').replaceChildren();$('#wholesale-progress').value=0;$('#wholesale-minimum').textContent='Elegí productos para consultar el importe.';return;}status('Actualizando importes desde el servidor…');try{const data=await api('cotizar',{items:items()});if(current!==revision)return;renderQuote(data);status(catalog.contactReady?'Precios consultados. Personalización y entrega a confirmar.':'El contacto mayorista todavía no está configurado.');}catch(e){if(current===revision)status(e.message);}}
function renderCatalog(){
 if(!catalog)return;
 const tier=$('#wholesale-tier').value;
 $('#wholesale-catalog').replaceChildren(...catalog.items.map(i=>{
  const card=node('article');card.className='wholesale-product';card.dataset.variant=i.id;
  const photo=node('div');photo.className='wholesale-photo';
  if(i.image){const img=node('img');img.src=i.image;img.alt=i.name;img.loading='lazy';img.onerror=()=>photo.replaceChildren(node('span','Foto pendiente'));photo.append(img);}else photo.append(node('span','Foto pendiente'));
  const label=node('label','Cantidad');const input=node('input');input.type='number';input.min='0';input.max='1000';input.step='1';input.value=selected.get(i.id)||'';input.inputMode='numeric';input.setAttribute('aria-label','Cantidad de '+i.name);input.disabled=saved||busy;
  const add=node('button','Actualizar');add.type='button';add.className='button-secondary';add.disabled=saved||busy;
  const update=(immediate=false)=>{if(saved||busy)return;const qty=quantity(input.value);if(qty===null||input.validity.badInput){revision++;quote=null;controls();$('#wholesale-total').textContent='—';status('Revisá la cantidad');return;}if(qty)selected.set(i.id,qty);else selected.delete(i.id);revision++;quote=null;controls();$('#wholesale-total').textContent='—';clearTimeout(quoteTimer);if(immediate)refresh();else quoteTimer=setTimeout(refresh,150);};
  add.onclick=()=>{normalize();update(true);};input.oninput=update;const normalize=()=>{const qty=quantity(input.value);if(qty!==null&&!input.validity.badInput)input.value=qty?String(qty):'';};input.onchange=normalize;input.onblur=normalize;label.append(input);
  const price=node('p',money.format(i.prices?.[tier]??i.price)+' c/u');price.className='wholesale-price';
  const category=node('p',i.category||'MATES');category.className='wholesale-category';
  const quantities=node('div');quantities.className='wholesale-quantity';quantities.append(label,add);
  const details=node('details');const summary=node('summary','Ver las 3 escalas');details.append(summary);
  const table=node('table');for(const [key,title] of [['10','10–49'],['50','50–99'],['100','100+']]){const row=node('tr');row.append(node('th',title+' u.'),node('td',money.format(i.prices?.[key]??i.price)));table.append(row);}details.append(table);
  const subtotal=node('p');subtotal.className='wholesale-subtotal';subtotal.hidden=true;card.append(photo,category,node('h3',i.name),price,subtotal,details,quantities);if(i.id==='700010'||i.id==='700011'){const note=node('p','Imagen ilustrativa. Tabla + cuchillo según variante.');note.className='wholesale-image-note';card.append(note);}return card;
 }));
}
$('#wholesale-tier').onchange=()=>{if(!payload&&!busy&&!saved){if(selected.size)refresh();else renderCatalog();}};
async function load(){const epoch=++revision;try{
 catalog=await api('catalogo'+(new URL(location.href).searchParams.has('ref')?'?ref='+encodeURIComponent(new URL(location.href).searchParams.get('ref')):''));
 if(epoch!==revision)return;if(accountId&&accountId!==catalog.accountId){invalidate();return;}accountId=catalog.accountId;
 $('#minimum').textContent=catalog.minimum;$('#wholesale-progress').max=catalog.minimum;
 $('#wholesale-private').hidden=false;renderCatalog();const province=$('[name=provincia]'),previousProvince=province.value;province.replaceChildren(new Option('Seleccionar provincia',''),...catalog.provinces.map(p=>new Option(p.name,p.name)));if(catalog.provinces.some(p=>p.name===previousProvince))province.value=previousProvince;
 status(catalog.items.length?(catalog.contactReady?'Elegí productos para tu solicitud. Grabado y packaging de regalo incluidos.':'Contacto mayorista pendiente de configuración. Podés explorar el catálogo.'):'Todavía no hay ofertas mayoristas habilitadas.');
 $('#wholesale-retry').hidden=true;controls();void profile();void history();
 }catch(e){if(e.status!==401){status(e.message);$('#wholesale-retry').hidden=false;}}}

$('#wholesale-retry').onclick=load;
$('#wholesale-continue').onclick=()=>{if(!quote?.eligible)return;$('#wholesale-buyer').hidden=false;$('#wholesale-buyer').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});showMissing();[...form.querySelectorAll('[name]')].find(f=>!f.closest('label').hidden)?.focus({preventScroll:true});};
// Keep one opaque key across retries/reloads; never persist buyer data in browser storage.
$('#wholesale-form').onsubmit=async e=>{e.preventDefault();if(busy||saved||!quote?.eligible||!catalog.contactReady)return;busy=true;controls();for(const c of $('#wholesale-form').elements)c.disabled=true;for(const c of $('#wholesale-catalog').querySelectorAll('input,button'))c.disabled=true;try{if(!payload){const comprador=Object.fromEntries([...$('#wholesale-form').querySelectorAll('[name]')].map(c=>[c.name,c.value.trim()]));key=sessionStorage.getItem('mb_wholesale_request_key:'+accountId)||crypto.randomUUID();sessionStorage.setItem('mb_wholesale_request_key:'+accountId,key);payload={items:items(),comprador,idempotencia:key};}const receipt=await api('solicitudes',payload);saved=true;$('#wholesale-buyer').hidden=true;$('#receipt-title').textContent=receipt.number;$('#receipt-total').textContent='Importe preliminar guardado: '+money.format(receipt.quote.total);$('#wholesale-message').value=receipt.message;$('#wholesale-whatsapp').href=receipt.whatsappUrl;$('#wholesale-receipt').hidden=false;status('Solicitud guardada. No es una compra pagada ni una reserva de inventario.');$('#wholesale-receipt').scrollIntoView({behavior:'auto'});try{window.open(receipt.whatsappUrl,'_blank','noopener,noreferrer');}catch{status('La solicitud quedó guardada. Usá Abrir WhatsApp o Copiar mensaje.');}}catch(e){status(e.message+' Podés reintentar la misma solicitud.');// Validation before persistence can be corrected; an uncertain outcome keeps the attempted payload frozen.
if(e.status===400){payload=null;for(const c of $('#wholesale-form').elements)c.disabled=false;for(const c of $('#wholesale-catalog').querySelectorAll('input,button'))c.disabled=false;}$('#wholesale-submit').disabled=false;}finally{busy=false;controls();}};
$('#wholesale-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#wholesale-message').value);status('Mensaje copiado. La solicitud sigue guardada.');}catch{status('Seleccioná y copiá el mensaje preparado.');$('#wholesale-message').focus();$('#wholesale-message').select();}};
$('#wholesale-new').onclick=()=>{sessionStorage.removeItem('mb_wholesale_request_key:'+accountId);location.assign('/mayorista');};
let authChannel;try{authChannel=new BroadcastChannel('matebreak-auth');authChannel.onmessage=event=>{if(event.data==='logout')invalidate();};}catch{}
window.addEventListener('pagehide',()=>{$('#wholesale-private').hidden=true;});
window.addEventListener('pageshow',event=>{if(event.persisted){$('#wholesale-private').hidden=true;load();}});
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState!=='visible'){$('#wholesale-private').hidden=true;return;}if(!catalog)return;$('#wholesale-private').hidden=true;try{const result=await api('acceso');if(result.accountId!==accountId){invalidate();return;}$('#wholesale-private').hidden=false;}catch(e){if(e.status!==401){status('No pudimos verificar tu sesión. Reintentá el acceso.');$('#wholesale-retry').hidden=false;}}});
const form=$('#wholesale-form');
form.addEventListener('input',event=>{if(event.target.name)dirty.add(event.target.name);});
form.addEventListener('change',event=>{if(event.target.name)dirty.add(event.target.name);});
async function profile(){
 const epoch=++profileRevision,owner=accountId;$('#wholesale-profile-status').textContent='Cargando tus datos de Mi Cuenta…';
 try{const data=await api('perfil');if(epoch!==profileRevision||owner!==accountId||!catalog||busy||saved)return;
  if(data.accountId!==owner){invalidate();return;}applyDefaults(form,data.buyer,dirty);addresses=data.addresses;
  const select=$('#wholesale-address');select.replaceChildren(new Option('Completar manualmente',''),...addresses.map(d=>new Option(d.label,d.id)));
  $('#wholesale-address-label').hidden=!addresses.length;
  if(addresses.length===1){applyDefaults(form,{localidad:addresses[0].localidad,provincia:addresses[0].provincia,whatsapp:addresses[0].whatsapp},dirty);select.value=addresses[0].id;}
  showMissing();$('#wholesale-profile-status').textContent='Datos de tu cuenta cargados. Podés revisarlos antes de enviar.';$('#wholesale-profile-retry').hidden=true;
 }catch(e){if(e.status!==401&&epoch===profileRevision){$('#wholesale-profile-status').textContent=e.message;$('#wholesale-profile-retry').hidden=false;}}
}
$('#wholesale-profile-retry').onclick=profile;
$('#wholesale-address').onchange=()=>{if(busy||saved||payload)return;const address=addresses.find(d=>d.id===$('#wholesale-address').value);if(address){applyAddress(form,address,dirty);showMissing();}};
async function history(){
 const owner=accountId;$('#wholesale-history-status').textContent='Consultando tus solicitudes…';
 try{const rows=await api('solicitudes');if(owner!==accountId||!catalog)return;$('#wholesale-history-list').replaceChildren(...rows.map(row=>{const card=node('article');card.append(node('h3',row.number+' · '+row.state.replaceAll('_',' ')),node('p',row.quote.items.map(i=>i.quantity+' × '+i.name).join(' · ')),node('p',money.format(row.quote.total)));return card;}));$('#wholesale-history-status').textContent=rows.length?'Tus últimos pedidos comerciales.':'Todavía no tenés solicitudes mayoristas.';
 }catch(e){if(e.status!==401)$('#wholesale-history-status').textContent=e.message;}
}
$('#wholesale-history-refresh').onclick=history;
function showMissing(){
 if(reviewAll)return;
 for(const input of form.querySelectorAll('[name]'))input.closest('label').hidden=input.required&&!!input.value.trim()&&input.checkValidity()&&!dirty.has(input.name);
}
$('#wholesale-review-data').onclick=()=>{reviewAll=true;for(const label of form.querySelectorAll('label'))label.hidden=false;};
function paintPrices(data){
 const tier=String(data?.tier||$('#wholesale-tier').value);
 for(const item of catalog?.items||[]){
  const card=[...$('#wholesale-catalog').children].find(c=>c.dataset.variant===String(item.id));if(!card)continue;
  const line=data?.items.find(i=>String(i.id)===String(item.id));
  card.querySelector('.wholesale-price').textContent=money.format(line?.unitPrice??item.prices?.[tier]??item.price)+' c/u';
  const subtotal=card.querySelector('.wholesale-subtotal');subtotal.hidden=!line;subtotal.textContent=line?'Subtotal · '+money.format(line.subtotal):'';
 }
}

load();
