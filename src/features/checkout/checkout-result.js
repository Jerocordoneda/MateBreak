import {simulationKind,deliveryText} from './order-presentation.mjs';
import {isOrderId,publicNumber,paymentState,countdown} from './result-state.mjs';
import {readOrder,rememberOrder} from '../orders/recent-order.mjs';
const id=new URLSearchParams(location.search).get('pedido'),$=s=>document.querySelector(s);
const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v)||0);
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let cancel=()=>{},revision=0;
function stop(){cancel();$('#result-countdown').hidden=true;}
for(const selector of ['#result-home','#result-next','#cancel-return'])$(selector).addEventListener('click',stop);
window.addEventListener('pagehide',stop);motion.addEventListener('change',stop);
function summary(order){
 $('#result-items').replaceChildren(...(order.items||[]).map(i=>{const li=document.createElement('li');li.textContent=i.cantidad+' × '+i.nombre+' · '+money(i.precio_unitario*i.cantidad);return li;}));
 $('#result-totals').replaceChildren();
 for(const [label,value] of [['Productos',order.subtotal_mercaderia],['Descuentos',order.descuento_productos],['Envío',order.costo_envio],['Total',order.total]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=money(value);$('#result-totals').append(dt,dd);}
 $('#result-delivery').textContent='Entrega: '+deliveryText(order.direccion_entrega);
 $('#result-summary').hidden=false;
}
async function load(){
 const epoch=++revision;stop();
 for(const s of ['#payment-mark','#result-number','#result-next','#result-retry','#result-summary','#transfer-details','#result-recovery','#result-test-mode'])$(s).toggleAttribute('hidden',true);
 $('#result-card').dataset.approved='false';$('#result-title').textContent='Consultando tu pedido…';$('#result-description').textContent='Estamos verificando el estado con MateBreak.';
 try{
  if(!isOrderId(id))throw Error('Abrí el resultado desde tu compra o el acceso privado a tu pedido.');
  const order=await readOrder(id);if(epoch!==revision)return;
  const state=paymentState(order),number=publicNumber(order),simulation=simulationKind(order);
  $('#result-title').textContent={approved:'¡Pago aprobado!',pending:'Pago pendiente',rejected:'Pago rechazado',expired:'La reserva venció',cancelled:'Pedido cancelado'}[state];
  $('#result-description').textContent={approved:'Gracias por tu compra. Ya estamos preparando tu pedido',pending:'Esperamos la confirmación del pago antes de preparar tu pedido.',rejected:'El pago no fue aprobado. Consultá tu pedido antes de volver a intentar.',expired:'Consultá tu pedido antes de iniciar una nueva compra.',cancelled:'Consultá el estado de tu pedido antes de iniciar una nueva compra.'}[state];
  $('#payment-mark').toggleAttribute('hidden',state!=='approved');$('#result-card').dataset.approved=String(state==='approved');
  if(number){$('#result-number').textContent='Pedido #'+number;$('#result-number').hidden=false;}
  $('#result-next').href='/src/pages/pedido.html?pedido='+encodeURIComponent(order.id);$('#result-next').hidden=false;
  summary(order);
  if(simulation){$('#result-test-mode').hidden=false;$('#result-test-mode').textContent=simulation==='persistente'?'Staging · pago simulado. Pedido y reserva de inventario de prueba guardados. Sin cobros ni despachos reales.':'Simulación sin persistencia. Sin cobro ni reserva de inventario.';}
  if(state==='pending'&&order.instructions){
   $('#transfer-details').hidden=false;$('#transfer-message').textContent=order.instructions.message+' Vence: '+new Date(order.reserva_hasta).toLocaleString('es-AR');
   for(const field of ['cbu','alias','holder'])$('#transfer-'+field).textContent=order.instructions[field];
   for(const field of ['cbu','alias'])$('#copy-'+field).onclick=()=>navigator.clipboard.writeText(order.instructions[field]);
  }
  // Only a verified persisted order with a public number can be recovered on
  // Home. Storage holds a navigation ID, never an authorization credential.
  const recoverable=number&&simulation!=='volatil'&&rememberOrder(order.id);
  $('#result-recovery').hidden=false;
  $('#result-recovery').textContent=recoverable?'También encontrarás “Ver mi pedido” en Inicio, en este navegador mientras conserves tu sesión de compra.':'Conservá esta página para consultar tu pedido. El regreso automático está desactivado.';
  if(state==='approved'&&recoverable&&!motion.matches){
   $('#result-countdown').hidden=false;
   cancel=countdown({tick:n=>{$('#return-copy').textContent='Volviendo al inicio automáticamente en '+n+' segundos…';$('#return-progress').value=5-n;},redirect:path=>location.assign(path)});
  }
 }catch{if(epoch!==revision)return;$('#result-title').textContent='No pudimos verificar el pedido';$('#result-description').textContent='El acceso puede haber vencido o la conexión estar temporalmente inaccesible. Podés reintentar la consulta sin generar otra compra.';$('#result-retry').hidden=false;}
}
$('#result-retry').onclick=load;
window.addEventListener('pageshow',e=>{if(e.persisted)load();});
load();
