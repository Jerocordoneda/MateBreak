const $=s=>document.querySelector(s),money=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
async function api(path,data){const r=await fetch('/api/mayorista/'+path,{method:data?'POST':'GET',credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})});const body=await r.json();if(!r.ok)throw Object.assign(Error(body.error||'No pudimos consultar el servidor'),{status:r.status});return body;}
let catalog,quote,revision=0,key,payload,saved=false,busy=false;const selected=new Map();
const status=text=>$('#wholesale-status').textContent=text;
function controls(){const ready=!!quote?.eligible&&!!catalog?.contactReady&&!saved&&!busy;$('#wholesale-continue').disabled=!ready;$('#wholesale-submit').disabled=!ready;}
function renderQuote(data){quote=data;$('#wholesale-tier-current').textContent='Tramo aplicado: '+(data.tier>=100?'100+':data.tier>=50?'50–99':'10–49')+' unidades · '+(data.benefit||'Grabado + packaging de regalo');$('#wholesale-lines').replaceChildren(...data.items.map(i=>{const p=node('p',`${i.quantity} × ${i.name} · ${money.format(i.unitPrice)} c/u · ${money.format(i.subtotal)}`);p.className='wholesale-line';return p;}));$('#wholesale-total').textContent=money.format(data.total);$('#wholesale-progress').max=data.minimum;$('#wholesale-progress').value=Math.min(data.units,data.minimum);$('#wholesale-minimum').textContent=`${data.units} unidades elegibles. ${data.remaining?'Faltan '+data.remaining+' para continuar.':'Mínimo alcanzado.'}`;controls();}
function items(){return [...selected].map(([id,cantidad])=>({id,cantidad})).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);}
async function refresh(){const current=++revision;quote=null;controls();$('#wholesale-total').textContent='—';if(!selected.size){$('#wholesale-tier-current').textContent='Precios base · 10–49 unidades';$('#wholesale-lines').replaceChildren();$('#wholesale-progress').value=0;$('#wholesale-minimum').textContent='Elegí productos para consultar el importe.';return;}status('Actualizando importes desde el servidor…');try{const data=await api('cotizar',{items:items()});if(current!==revision)return;renderQuote(data);status(catalog.contactReady?'Precios consultados. Personalización y entrega a confirmar.':'El contacto mayorista todavía no está configurado.');}catch(e){if(current===revision)status(e.message);}}
function renderCatalog(){
 const tier=$('#wholesale-tier').value;
 $('#wholesale-catalog').replaceChildren(...catalog.items.map(i=>{
  const card=node('article');card.className='wholesale-product';card.dataset.variant=i.id;
  const photo=node('div');photo.className='wholesale-photo';
  if(i.image){const img=node('img');img.src=i.image;img.alt=i.name;img.loading='lazy';img.onerror=()=>photo.replaceChildren(node('span','Foto pendiente'));photo.append(img);}else photo.append(node('span','Foto pendiente'));
  const label=node('label','Cantidad');const input=node('input');input.type='number';input.min='0';input.max='1000';input.step='1';input.value=selected.get(i.id)||0;input.setAttribute('aria-label','Cantidad de '+i.name);input.disabled=saved||busy;
  const add=node('button','Actualizar');add.type='button';add.className='button-secondary';add.disabled=saved||busy;
  const update=()=>{if(saved||busy)return;const qty=Number(input.value);if(!Number.isInteger(qty)||qty<0||qty>1000){status('Revisá la cantidad');return;}if(qty)selected.set(i.id,qty);else selected.delete(i.id);refresh();};
  add.onclick=update;input.onchange=update;label.append(input);
  const price=node('p',money.format(i.prices?.[tier]??i.price)+' c/u');price.className='wholesale-price';
  const category=node('p',i.category||'MATES');category.className='wholesale-category';
  const quantities=node('div');quantities.className='wholesale-quantity';quantities.append(label,add);
  const details=node('details');const summary=node('summary','Ver las 3 escalas');details.append(summary);
  const table=node('table');for(const [key,title] of [['10','10–49'],['50','50–99'],['100','100+']]){const row=node('tr');row.append(node('th',title+' u.'),node('td',money.format(i.prices?.[key]??i.price)));table.append(row);}details.append(table);
  card.append(photo,category,node('h3',i.name),price,details,quantities);if(i.id==='700010'||i.id==='700011'){const note=node('p','Imagen ilustrativa. Tabla + cuchillo según variante.');note.className='wholesale-image-note';card.append(note);}return card;
 }));
}
$('#wholesale-tier').onchange=renderCatalog;
async function load(){try{
 catalog=await api('catalogo'+(new URL(location.href).searchParams.has('ref')?'?ref='+encodeURIComponent(new URL(location.href).searchParams.get('ref')):''));
 $('#minimum').textContent=catalog.minimum;$('#wholesale-progress').max=catalog.minimum;
 if(catalog.contactUrl){$('#wholesale-contact').href=catalog.contactUrl;$('#wholesale-contact').hidden=false;}
 renderCatalog();const province=$('[name=provincia]');province.replaceChildren(new Option('Seleccionar provincia',''),...catalog.provinces.map(p=>new Option(p.name,p.name)));
 status(catalog.items.length?(catalog.contactReady?'Elegí productos para tu solicitud. Grabado y packaging de regalo incluidos.':'Contacto mayorista pendiente de configuración. Podés explorar el catálogo.'):'Todavía no hay ofertas mayoristas habilitadas.');
 $('#wholesale-retry').hidden=true;controls();
 }catch(e){status(e.message);$('#wholesale-retry').hidden=false;}}

$('#wholesale-retry').onclick=load;
$('#wholesale-continue').onclick=()=>{if(!quote?.eligible)return;$('#wholesale-buyer').hidden=false;$('#wholesale-buyer').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});$('[name=nombre]').focus({preventScroll:true});};
// Keep one opaque key across retries/reloads; never persist buyer data in browser storage.
$('#wholesale-form').onsubmit=async e=>{e.preventDefault();if(busy||saved||!quote?.eligible||!catalog.contactReady)return;busy=true;controls();for(const c of $('#wholesale-form').elements)c.disabled=true;for(const c of $('#wholesale-catalog').querySelectorAll('input,button'))c.disabled=true;try{if(!payload){const comprador=Object.fromEntries([...$('#wholesale-form').querySelectorAll('[name]')].map(c=>[c.name,c.value.trim()]));key=sessionStorage.getItem('mb_wholesale_request_key')||crypto.randomUUID();sessionStorage.setItem('mb_wholesale_request_key',key);payload={items:items(),comprador,idempotencia:key};}const receipt=await api('solicitudes',payload);saved=true;$('#wholesale-buyer').hidden=true;$('#receipt-title').textContent=receipt.number;$('#receipt-total').textContent='Importe preliminar guardado: '+money.format(receipt.quote.total);$('#wholesale-message').value=receipt.message;$('#wholesale-whatsapp').href=receipt.whatsappUrl;$('#wholesale-receipt').hidden=false;status('Solicitud guardada. No es una compra pagada ni una reserva de inventario.');$('#wholesale-receipt').scrollIntoView({behavior:'auto'});try{window.open(receipt.whatsappUrl,'_blank','noopener,noreferrer');}catch{status('La solicitud quedó guardada. Usá Abrir WhatsApp o Copiar mensaje.');}}catch(e){status(e.message+' Podés reintentar la misma solicitud.');// Validation before persistence can be corrected; an uncertain outcome keeps the attempted payload frozen.
if(e.status===400){payload=null;for(const c of $('#wholesale-form').elements)c.disabled=false;for(const c of $('#wholesale-catalog').querySelectorAll('input,button'))c.disabled=false;}$('#wholesale-submit').disabled=false;}finally{busy=false;controls();}};
$('#wholesale-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#wholesale-message').value);status('Mensaje copiado. La solicitud sigue guardada.');}catch{status('Seleccioná y copiá el mensaje preparado.');$('#wholesale-message').focus();$('#wholesale-message').select();}};
$('#wholesale-new').onclick=()=>{sessionStorage.removeItem('mb_wholesale_request_key');location.assign('/mayorista');};
load();
