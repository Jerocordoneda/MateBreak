// Consume the fragment before any network operation. No analytics, third-party
// scripts, storage of credentials or client-readable session tokens on this page.
const link=location.hash.slice(1);
history.replaceState(null,'',location.pathname+location.search);
const $=s=>document.querySelector(s), money=v=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(Number(v)||0);
const states={pendiente_pago:'Pendiente de pago',pagado:'Pago confirmado',en_preparacion:'En preparación',enviado:'Despachado',entregado:'Entregado',cancelado:'Cancelado',expirado:'Reserva vencida'};
async function api(path,body){const response=await fetch(path,{credentials:'same-origin',cache:'no-store',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw Error('El acceso no está disponible o venció. Podés solicitar otro enlace.');return result;}
function show(order){
 $('#title').textContent='Pedido '+(order.numero||order.numero_publico||order.id.slice(0,8).toUpperCase());$('#message').textContent=states[order.estado]||'Estado en revisión';
 const payments=order.pagos||order.pago||[],mock=payments.some(p=>p.simulado||p.referencia_externa==='TEST-LOCAL-'+order.id)||order.simulacion==='persistente';
 $('#simulation').hidden=!mock;$('#simulation').textContent=mock?'Staging · pago simulado. Sin cobros ni despachos reales.':'';
 for(const i of order.items||[]){const item=document.createElement('li');const options=Object.entries(i.opciones||{}).filter(([,v])=>typeof v==='string').map(([k,v])=>k+': '+v).join(' · ');item.textContent=`${i.cantidad} × ${i.nombre} · ${money(i.precio_unitario*i.cantidad)}${options?' · '+options:''}${i.personalizacion?' · '+i.personalizacion:''}`;$('#items').append(item);}
 for(const [label,value] of [['Mercadería',order.subtotal_mercaderia],['Descuento de pago',order.descuento_productos],['Envío',order.costo_envio],['Total ARS',order.total]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=money(value);$('#totals').append(dt,dd);}
 const d=order.direccion_entrega?.destinatario||order.direccion_entrega||{};$('#delivery').textContent=[d.nombre,d.apellido,typeof d.destinatario==='string'?d.destinatario:null,d.calle,d.numero,d.ciudad,d.provincia,d.codigo_postal].filter(v=>typeof v==='string').join(' · ');
 $('#payment').textContent=payments.map(p=>(mock?'PAGO SIMULADO':p.metodo==='transferencia'?'Transferencia bancaria':'Mercado Pago')+' · '+({aprobado:'Aprobado',pendiente:'Pendiente',cancelado:'Cancelado'}[p.estado]||'En revisión')).join(' · ')||'Pendiente de confirmación';
 $('#shipping').textContent=order.tracking?`Correo Argentino · ${order.tracking.codigo} · ${order.tracking.estado==='delivered'?'Entregado':order.tracking.estado==='in_transit'?'En tránsito':'Despacho verificado'}`:'Todavía no hay un despacho verificado ni seguimiento disponible.';
 $('#tracking').hidden=!order.tracking;$('#order').hidden=false;
}
try{let id=new URLSearchParams(location.search).get('pedido');if(link){if(!/^[A-Za-z0-9_-]{43}$/.test(link))throw Error('El enlace no está disponible.');({pedido:id}=await api('/api/seguimiento/intercambiar',{credencial:link}));history.replaceState(null,'',location.pathname+'?pedido='+encodeURIComponent(id));}
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id||''))throw Error('Abrí el enlace privado del correo o solicitá uno nuevo.');
 let order;try{order=await api('/api/seguimiento/'+encodeURIComponent(id));}catch{order=await api('/api/checkout/pedidos/'+encodeURIComponent(id)+'?consulta=carrito');}show(order);
}catch(error){$('#message').textContent=error.message;$('#recovery').hidden=false;}
$('#renew').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;try{const result=await api('/api/seguimiento/renovar',Object.fromEntries(new FormData(event.currentTarget)));$('#message').textContent=result.mensaje;}catch(error){$('#message').textContent=error.message;}finally{button.disabled=false;}});
