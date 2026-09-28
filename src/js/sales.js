import {api,element,message,button,overview} from './account.js';
import {dateTime,filterRecords,saleTotals} from './account-data.js';
const $=selector=>document.querySelector(selector),money=n=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(n);
const labels={por_grabar:'Por grabar',por_entregar:'Por entregar',entregada:'Entregada'};
let products=[],pending,busy=false,records=[];
function total(){let cents=0;for(const line of document.querySelectorAll('.sale-line')){const q=Number(line.querySelector('[name=cantidad]').value),p=Number(line.querySelector('[name=precio_unitario]').value);if(Number.isFinite(q)&&Number.isFinite(p))cents+=q*Math.round(p*100);}$('#sale-total').textContent=money(cents/100);}
function field(label,name,type='text'){const l=element('label',label),input=element('input');input.name=name;input.type=type;l.append(input);return {label:l,input};}
function addLine(){
 if($('#sale-lines').children.length>=50)return;
 const row=element('div',undefined,'sale-line'),label=element('label','Producto base','product-field'),select=element('select');select.name='producto_id';select.required=true;select.add(new Option('Seleccionar producto',''));
 for(const p of products)select.add(new Option(p.nombre+' · '+p.sku,p.id));label.append(select);
 const qty=field('Cantidad','cantidad','number');qty.input.required=true;qty.input.min=1;qty.input.max=10000;qty.input.step=1;qty.input.value=1;
 const price=field('Precio unitario (ARS)','precio_unitario','number');price.input.required=true;price.input.min='0.01';price.input.max=1000000;price.input.step='0.01';price.input.placeholder='Importe vendido';
 const engraving=field('Grabado / diseño solicitado','personalizacion');engraving.label.className='engraving';engraving.input.maxLength=500;engraving.input.placeholder='Ej.: River en la virola, nombre y tipografía';
 const remove=button('Quitar',()=>{if($('#sale-lines').children.length===1){message('La venta necesita al menos un producto.',true);return;}row.remove();total();});remove.setAttribute('aria-label','Quitar línea de venta');
 select.onchange=()=>{const p=products.find(p=>p.id===select.value);price.input.value=p?.precio??'';total();};qty.input.oninput=total;price.input.oninput=total;
 row.append(label,qty.label,price.label,remove,engraving.label);$('#sale-lines').append(row);
}
async function list(){
 const sales=await api('/ventas');
 records=sales;
 overview('#seller-overview',[['Por grabar',sales.filter(s=>s.estado==='por_grabar').length,'Diseños pendientes de preparar'],['Por entregar',sales.filter(s=>s.estado==='por_entregar').length,'Piezas reservadas para sus clientes'],['Entregadas',sales.filter(s=>s.estado==='entregada').length,'En tus últimas ventas registradas']]);
 renderSales();
}
function renderSales(){
 const sales=filterRecords(records,$('#sales-search').value,$('#sales-filter').value,s=>[s.cliente,s.telefono,s.id,...(s.items??[]).map(i=>i.nombre+' '+i.personalizacion)].join(' ')),totals=saleTotals(sales);
 $('#sales-summary').textContent=`${sales.length} de ${records.length} ventas cargadas (máximo 200) · Importe registrado: ${money(totals.cents/100)} · ${totals.units} piezas · ${totals.reserved} pendientes de entrega. No representa pagos verificados.`;
 $('#sales-list').replaceChildren(...sales.map(s=>{
  const card=element('article',undefined,'sale-card'),head=element('div',undefined,'order-heading');head.append(element('h3',s.cliente),element('span',labels[s.estado],'order-status'));card.append(head,element('p',`${new Date(s.creado_en).toLocaleDateString('es-AR')} · Venta ${s.id.slice(0,8).toUpperCase()} · ${money(s.total)}`));
  for(const i of s.items){card.append(element('p',`${i.cantidad} × ${i.nombre} · ${money(i.precio_unitario)} c/u`));if(i.personalizacion)card.append(element('p','Grabado: '+i.personalizacion,'engraving-text'));}
  if(s.telefono)card.append(element('p','Teléfono: '+s.telefono));if(s.notas)card.append(element('p',s.notas));
  card.append(element('p','Medio de pago informado: '+s.metodo_pago));
  card.append(element('p','Registrada: '+dateTime(s.creado_en)));
  if(s.actualizado_en)card.append(element('p','Última actualización: '+dateTime(s.actualizado_en)));
  if(s.entregada_en)card.append(element('p','Entregada: '+dateTime(s.entregada_en)));
  card.append(element('p',s.estado==='entregada'?'Stock: piezas entregadas, sin reserva pendiente.':'Stock: piezas reservadas hasta confirmar la entrega.'));
  if(s.estado!=='entregada')card.append(button(s.estado==='por_grabar'?'Grabado listo → Por entregar':'Confirmar entrega',async()=>{await api('/ventas/'+s.id+'/estado','POST',{estado:s.estado==='por_grabar'?'por_entregar':'entregada'});message(s.estado==='por_grabar'?'Grabado listo. Las piezas siguen reservadas.':'Entrega registrada. Las piezas salieron del stock físico.');await list();}));
  return card;
 }));if(!sales.length)$('#sales-list').append(element('p',records.length?'No hay ventas que coincidan con estos filtros.':'Todavía no registraste ventas.','muted'));
}
export async function mountSales(){
 products=await api('/ventas/productos');pending=null;$('#sale-form').reset();$('#sale-lines').replaceChildren();addLine();total();await list();
 $('#add-line').onclick=addLine;$('#refresh-sales').onclick=()=>list().catch(e=>message(e.message,true));
 $('#sales-search').oninput=renderSales;$('#sales-filter').onchange=renderSales;
 $('#sale-form').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  const form=event.currentTarget,data=new FormData(form),items=[...document.querySelectorAll('.sale-line')].map(row=>({producto_id:row.querySelector('[name=producto_id]').value,cantidad:Number(row.querySelector('[name=cantidad]').value),precio_unitario:row.querySelector('[name=precio_unitario]').value,personalizacion:row.querySelector('[name=personalizacion]').value}));
  const body=Object.fromEntries(['cliente','telefono','estado','metodo_pago','notas'].map(k=>[k,data.get(k)]));body.items=items;
  if(body.estado==='por_grabar'&&!items.some(i=>i.personalizacion.trim())){message('Indicá el diseño o grabado solicitado.',true);return;}
  const signature=JSON.stringify(body);if(pending?.signature!==signature)pending={signature,id:crypto.randomUUID()};body.idempotencia=pending.id;
  busy=true;const controls=[...form.elements];controls.forEach(c=>c.disabled=true);let saved=false;
  try{const sale=await api('/ventas','POST',body);saved=true;pending=null;form.reset();$('#sale-lines').replaceChildren();addLine();total();message(`Venta ${sale.id.slice(0,8).toUpperCase()} guardada. ${sale.estado==='entregada'?'Stock descontado.':'Piezas reservadas.'}`);}
  catch(e){message(e.message,true);}
  finally{busy=false;controls.forEach(c=>c.disabled=false);}
  if(saved)await list().catch(()=>message('La venta se guardó. Usá Actualizar para consultar el listado.',true));
 };
}
