import {api,element,button,message} from './account.js';
import {dateTime,filterRecords} from './account-data.js';
const states={pendiente_pago:'Pendiente de pago',pagado:'Pago confirmado',en_preparacion:'En preparación',enviado:'En camino',entregado:'Entregado',cancelado:'Cancelado'};
const money=(value,currency)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:currency||'ARS'}).format(Number(value));
let records=[];
export async function loadOrders(){
 records=await api('/pedidos');
 document.querySelector('#orders-search').oninput=renderOrders;document.querySelector('#orders-filter').onchange=renderOrders;
 renderOrders();return records;
}
function renderOrders(){
 const orders=filterRecords(records,document.querySelector('#orders-search').value,document.querySelector('#orders-filter').value,o=>[o.id,...(o.items??[]).map(i=>i.nombre)].join(' ')),list=document.querySelector('#customer-orders');
 document.querySelector('#orders-summary').textContent=`${orders.length} de ${records.length} pedidos cargados (máximo 100)`;
 list.replaceChildren(...orders.map(order=>{
  const card=element('details',undefined,'customer-order'),head=element('summary'),title=element('div'),end=element('div',undefined,'order-summary-end');
  title.append(element('strong','Pedido #'+order.id.slice(0,8).toUpperCase()),element('small',new Date(order.creado_en).toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})));
  const badge=element('span',states[order.estado]||order.estado,'order-status');badge.dataset.state=order.estado;
  end.append(badge,element('strong',money(order.total,order.moneda)),element('span','⌄'));
  head.append(title,end);card.append(head);
  const items=element('ul');for(const item of order.items??[]){const line=element('li');line.append(element('span',`${item.cantidad} × ${item.nombre}`),element('span',money(item.subtotal,order.moneda)));items.append(line);}card.append(items);
  const facts=element('div',undefined,'order-facts');
  const fact=(label,text)=>{const p=element('p');p.append(element('strong',label),document.createTextNode(text));facts.append(p);};
  const d=order.direccion_entrega??{};
  fact('Entrega',d.retiro||[d.destinatario,d.calle,d.ciudad,d.departamento,d.pais].filter(Boolean).join(' · ')||'A coordinar');
  fact('Costo de envío',money(order.costo_envio,order.moneda));
  fact('Productos',`${(order.items??[]).reduce((n,i)=>n+i.cantidad,0)} unidades · ${money(order.subtotal??(Number(order.total)-Number(order.costo_envio)),order.moneda)}`);
  fact('Fecha del pedido',dateTime(order.creado_en));
  if(d.telefono)fact('Teléfono de entrega',d.telefono);
  if(d.codigo_postal)fact('Código postal',d.codigo_postal);
  if(d.indicaciones)fact('Indicaciones',d.indicaciones);
  for(const payment of order.pagos??[])fact('Pago',`${{transferencia:'Transferencia',mercadopago:'Mercado Pago',efectivo:'Efectivo'}[payment.metodo]??payment.metodo??'Pago del pedido'} · ${payment.estado}`);
  if(order.envio?.seguimiento)fact('Seguimiento',order.envio.seguimiento);
  if(order.envio?.transportista)fact('Transportista',order.envio.transportista);
  if(order.envio?.estado)fact('Estado del envío',({pendiente:'Pendiente',preparando:'En preparación',enviado:'En camino',entregado:'Entregado',cancelado:'Cancelado'})[order.envio.estado]??order.envio.estado);
  if(order.envio?.actualizado_en)fact('Última actualización del envío',dateTime(order.envio.actualizado_en));
  for(const payment of order.pagos??[]){if(payment.confirmado_en)fact('Pago confirmado',dateTime(payment.confirmado_en));if(payment.referencia_externa)fact('Referencia del pago',payment.referencia_externa);}
  if(order.estado==='pendiente_pago'&&order.reserva_hasta)fact('Reserva hasta',dateTime(order.reserva_hasta));
  card.append(facts);
  if(order.estado==='pendiente_pago')card.append(button('Cancelar pedido pendiente',async()=>{await api('/pedidos/'+order.id+'/cancelar','POST',{});await loadOrders();message('Pedido cancelado.');}));
  return card;
 }));
 if(!orders.length){const empty=element('div',undefined,'order-empty');empty.append(element('h3',records.length?'No encontramos coincidencias.':'Tu primera pausa empieza acá.'),element('p',records.length?'Probá otro estado, producto o número de pedido.':'Cuando hagas una compra, vas a encontrar acá su estado y todos los detalles.','muted'));if(!records.length){const a=element('a','Explorar la tienda →','button-primary');a.href='/tienda';empty.append(a);}list.append(empty);}
}
