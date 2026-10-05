import {api,element,message} from './ui.mjs';
import {dateTime} from './account-data.js';
let disposeRetail;
export async function mountRetailOrders(){
 disposeRetail?.();
 document.querySelector('#retail-orders-panel')?.remove();
 const panel=element('section',undefined,'account-card'),list=element('div'),refresh=element('button','Actualizar pedidos','button-secondary');
 panel.id='retail-orders-panel';
 panel.append(element('h2','Pedidos · operación minorista'),element('p','Transferencias se confirman arriba tras verificar el ingreso bancario. El despacho requiere tracking verificado.','muted'),refresh,list);
 let page=1;
 const previous=element('button','Pedidos anteriores','button-secondary'),next=element('button','Pedidos siguientes','button-secondary'),position=element('p');
 panel.append(previous,position,next);
 document.querySelector('#pending-transfers').parentElement.append(panel);
 const money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v));
 async function load(){
  const orders=await api('/admin/pedidos?pagina='+page);
  previous.disabled=page===1;next.disabled=orders.length<100;position.textContent='Página de pedidos '+page;
  list.replaceChildren();
  if(!orders.length){list.append(element('p','Sin pedidos registrados.'));return;}
  for(const o of orders){
   const card=element('details',undefined,'customer-order'),summary=element('summary'),body=element('div');
   summary.textContent='Pedido #'+(o.numero_publico||o.id.slice(0,8).toUpperCase())+' · '+money(o.total)+' · '+(o.revision_financiera?'Revisión financiera':o.listo_despachar?'Listo para despacho':o.estado);
   const recipient=o.entrega?.destinatario||{};
   body.append(element('p',(o.pagos||[]).map(p=>p.metodo+' · '+p.estado+' · '+money(p.importe)).join(' / ')),
    element('p','Creado '+dateTime(o.creado_en)+' · reserva hasta '+dateTime(o.reserva_hasta)),
    element('p',[o.entrega?.modalidad,recipient.nombre,recipient.apellido,recipient.calle,recipient.numero,recipient.ciudad,recipient.provincia].filter(Boolean).join(' · ')));
   if(o.tracking)body.append(element('p','Tracking verificado: '+o.tracking.tracking+' · '+o.tracking.state));
   const actions=o.estado==='pendiente_pago'?[['cancel','Cancelar reserva'],...(Date.parse(o.reserva_hasta)<=Date.now()?[['expire','Vencer reserva']]:[])]:
    o.estado==='pagado'&&!o.revision_financiera?[['prepare','Iniciar preparación']]:o.estado==='enviado'&&!o.revision_financiera?[['deliver','Registrar entrega']]:[];
   for(const [action,label]of actions){
    const button=element('button',label,'button-secondary'),actionId=crypto.randomUUID();
    button.onclick=async()=>{button.disabled=true;try{await api('/admin/pedidos/'+o.id+'/acciones','POST',{action,actionId,expectedState:o.estado});await load();document.dispatchEvent(new Event('retail-transfers-refresh'));}catch(e){message(e.message,true);button.disabled=false;}};
    body.append(button);
   }
   const history=element('ul');
   for(const h of o.historial||[])history.append(element('li',dateTime(h.fecha)+' · '+h.desde+' → '+h.hasta+' · '+h.action+(h.actor_id?' · operador '+h.actor_id.slice(0,8):' · sistema')));
   body.append(history);card.append(summary,body);list.append(card);
  }
 }
 previous.onclick=()=>{page--;load().catch(e=>message(e.message,true));};
 next.onclick=()=>{page++;load().catch(e=>message(e.message,true));};
 const refreshEvent=()=>load().catch(e=>message(e.message,true));
 document.addEventListener('retail-orders-refresh',refreshEvent);
 disposeRetail=()=>document.removeEventListener('retail-orders-refresh',refreshEvent);
 refresh.onclick=()=>load().catch(e=>message(e.message,true));
 await load();
}
