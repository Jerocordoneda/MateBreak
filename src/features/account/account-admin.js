import {api,element,message} from './ui.mjs';
import {dateTime} from './account-data.js';
import {mountTeam} from './account-team.js';
import {mountWholesaleAdmin} from './account-wholesale.js';

const $=s=>document.querySelector(s);
const money=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const number=new Intl.NumberFormat('es-AR');
const stateLabels={por_grabar:'Por grabar',por_entregar:'Por entregar',entregada:'Entregadas'};
const periodLabels={mes:'este mes','30_dias':'los últimos 30 días','90_dias':'los últimos 90 días',todo:'todo el historial'};

const empty=text=>element('p',text,'dashboard-empty');
const metric=(label,value,note,tone='')=>{
  const card=element('article',undefined,'dashboard-kpi '+tone);
  card.append(element('span',label),element('strong',value),element('small',note));
  return card;
};
const fact=(label,value)=>{const row=element('div',undefined,'dashboard-fact');row.append(element('span',label),element('strong',value));return row;};

function renderChart(series){
  const target=$('#dashboard-chart');target.replaceChildren();
  if(!series.length){target.append(empty('Todavía no hay ventas en este período.'));return;}
  const values=series.map(x=>Number(x.facturacion_entregada)),max=Math.max(...values,1);
  const bars=element('div',undefined,'chart-bars');
  series.slice(-31).forEach(point=>{
    const item=element('div',undefined,'chart-column');
    const bar=element('span',undefined,'chart-bar');bar.style.height=Math.max(3,Number(point.facturacion_entregada)/max*100)+'%';
    bar.title=`${point.fecha}: ${money.format(point.facturacion_entregada)} · ${point.ventas} ventas`;
    item.append(bar,element('small',new Date(point.fecha+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'short'})));bars.append(item);
  });target.append(bars);
}

function renderDashboard(data){
  const t=data.totales;
  $('#dashboard-period-note').textContent=`Resultados de ${periodLabels[data.periodo]}. Actualizado ${new Date(data.hasta).toLocaleString('es-AR')}.`;
  $('#admin-overview').replaceChildren(
    metric('Facturación entregada',money.format(t.facturacion_entregada),`${number.format(t.entregadas)} ventas realizadas`,'primary'),
    metric('Total registrado',money.format(t.facturacion_registrada),`${number.format(t.ventas)} ventas cargadas`),
    metric('Pendiente de entrega',money.format(t.monto_pendiente),`${number.format(t.por_grabar+t.por_entregar)} operaciones abiertas`,'pending'),
    metric('Clientes',number.format(t.clientes),`${number.format(t.clientes_nuevos)} nuevos · ${number.format(t.clientes_anteriores)} anteriores`),
    metric('Clientes recurrentes',number.format(t.clientes_recurrentes),'Compraron más de una vez en el historial'),
    metric('Ticket entregado',money.format(t.ticket_promedio_entregado),`${number.format(t.unidades)} unidades registradas`)
  );
  $('#dashboard-chart-total').textContent=money.format(t.facturacion_entregada);renderChart(data.serie);
  $('#dashboard-states').replaceChildren(
    fact(stateLabels.por_grabar,number.format(t.por_grabar)),
    fact(stateLabels.por_entregar,number.format(t.por_entregar)),
    fact(stateLabels.entregada,number.format(t.entregadas)),
    fact('Unidades',number.format(t.unidades))
  );

  const sellers=$('#dashboard-sellers');sellers.replaceChildren(...data.vendedores.map((seller,index)=>{
    const row=element('article',undefined,'dashboard-list-row'),copy=element('div');
    copy.append(element('span',`#${index+1} · ${seller.nombre}`),element('small',`${number.format(seller.ventas)} ventas · ${number.format(seller.clientes)} clientes · ${number.format(seller.unidades)} unidades`));
    const amount=element('div',undefined,'dashboard-amount');amount.append(element('strong',money.format(seller.facturacion_entregada)),element('small',`${money.format(seller.total_registrado)} registrado`));row.append(copy,amount);return row;
  }));if(!data.vendedores.length)sellers.append(empty('Todavía no hay actividad de vendedores en este período.'));

  const clients=$('#dashboard-clients');clients.replaceChildren(...data.clientes.slice(0,8).map(client=>{
    const row=element('article',undefined,'dashboard-list-row'),copy=element('div'),tag=client.es_nuevo?'Nuevo':'Anterior';
    copy.append(element('span',client.nombre),element('small',`${tag} · ${number.format(client.compras_historicas)} ${Number(client.compras_historicas)===1?'compra histórica':'compras históricas'} · última ${dateTime(client.ultima_compra)}`));
    const amount=element('div',undefined,'dashboard-amount');amount.append(element('strong',money.format(client.total_registrado)),element('small',`${number.format(client.ventas_periodo)} en el período`));row.append(copy,amount);return row;
  }));if(!data.clientes.length)clients.append(empty('Los clientes aparecerán cuando el equipo registre ventas.'));

  const recent=$('#dashboard-recent');recent.replaceChildren(...data.recientes.map(sale=>{
    const row=element('article',undefined,'dashboard-list-row recent-sale'),copy=element('div');
    copy.append(element('span',sale.cliente),element('small',`${sale.vendedor_nombre} · ${dateTime(sale.creado_en)} · ${number.format(sale.unidades)} unidades`));
    const amount=element('div',undefined,'dashboard-amount');amount.append(element('strong',money.format(sale.total)),element('small',stateLabels[sale.estado]));row.append(copy,amount);return row;
  }));if(!data.recientes.length)recent.append(empty('Sin ventas recientes para mostrar.'));
}

async function loadDashboard(){
  const button=$('#refresh-dashboard');button.disabled=true;
  try{renderDashboard(await api('/admin/dashboard?periodo='+encodeURIComponent($('#dashboard-period').value)));}
  finally{button.disabled=false;}
}

async function loadTransfers(){
  const target=$('#pending-transfers');target.replaceChildren();
  const orders=await api('/admin/transferencias');
  if(!orders.length){target.append(empty('No hay transferencias pendientes.'));return;}
  for(const order of orders){
    const row=element('article',undefined,'dashboard-list-row'),details=element('div');
    details.append(element('strong',`Pedido ${order.id.slice(0,8).toUpperCase()} · ${money.format(order.importe)}`),
      element('small',`Pendiente de transferencia · vence ${dateTime(order.reserva_hasta)}`));
    const form=element('form',undefined,'transfer-confirm-form'),reference=element('input'),button=element('button','Marcar como pagado','button-secondary');
    reference.name='referencia';reference.placeholder='Referencia bancaria verificada';reference.required=true;reference.maxLength=150;
    form.append(reference,button);
    form.onsubmit=async event=>{
      event.preventDefault();button.disabled=true;
      try{await api(`/admin/transferencias/${order.id}/confirmar`,'POST',{referencia:reference.value.trim()});message('Pago confirmado y auditado.');await loadTransfers();}
      catch(cause){message(cause.message,true);button.disabled=false;}
    };
    row.append(details,form);target.append(row);
  }
}

export async function mountAdmin(currentUser){
  mountWholesaleAdmin().catch(cause=>message(cause.message,true));
  $('#refresh-transfers').onclick=async()=>{try{await loadTransfers();}catch(e){message(e.message,true);}};
  $('#refresh-dashboard').onclick=async()=>{try{await loadDashboard();message('Dashboard actualizado.');}catch(e){message(e.message,true);}};
  $('#dashboard-period').onchange=async()=>{try{await loadDashboard();}catch(e){message(e.message,true);}};
  const dashboard=loadDashboard();
  const team=mountTeam(currentUser);
  const inventory=api('/admin/inventario').then(stock=>{
    const total=key=>stock.reduce((sum,item)=>sum+Number(item[key]||0),0);
    $('#inventory-summary').textContent=`${number.format(total('disponible'))} unidades disponibles · ${number.format(total('reservado'))} reservadas · abrir control de stock y movimientos.`;
  });
  await Promise.all([dashboard,team,inventory,loadTransfers().catch(e=>$('#pending-transfers').replaceChildren(empty(e.message)))]);
}
