import {api,element,message,button,overview} from './ui.mjs';
const $=selector=>document.querySelector(selector);

// Each section owns its state; a failure never suppresses another section.
export async function runSections(jobs,{current,onState}){
 return Promise.allSettled(Object.entries(jobs).map(async([name,job])=>{
  if(!current())return;
  onState(name,'loading');
  try{await job();if(current())onState(name,'ready');}
  catch(error){if(current()&&error.name!=='AbortError')onState(name,'error',error);}
 }));
}
export function mountCustomer(user,{signal,current}){
 if(!user||!current())return;
 $('#access-email').value=user.email;
 let orders=null,addresses=null;
 const summary=()=>overview('#customer-overview',[
  ['Mis pedidos',orders?.length??'—',orders?'Tus últimas compras':'Consultá la sección de pedidos'],
  ['En curso',orders?.filter(o=>!['entregado','cancelado'].includes(o.estado)).length??'—','Pedidos pendientes de completar'],
  ['Direcciones',addresses?.length??'—',addresses?'Listas para tu próxima compra':'Consultá la sección de direcciones'],
 ]);
 const state=(name,status,error)=>{
  const box=$('#'+name+'-load');box.replaceChildren();box.hidden=status==='ready';
  box.setAttribute('aria-busy',String(status==='loading'));
  if(status==='loading'){box.append(element('span',undefined,'account-spinner'),element('span','Cargando '+({profile:'tus datos',orders:'tus pedidos',emails:'tus emails',addresses:'tus direcciones'})[name]+'…'));}
  if(status==='error'){box.append(element('span',error?.name==='TimeoutError'?'La consulta está demorando. Podés volver a intentar.':'No pudimos cargar esta sección.'),button('Reintentar',()=>run(name)));}
  if(name==='profile')for(const c of $('#profile').elements)if(c.id!=='access-email')c.disabled=status!=='ready';
 };
 const read=route=>api(route,'GET',undefined,{signal});
 const jobs={
  profile:async()=>{const data=await read('/perfil');if(!current())return;for(const k of ['nombre','telefono'])$('#profile').elements.namedItem(k).value=data?.[k]||'';},
  orders:async()=>{const {loadOrders}=await import('./account-orders.js');const data=await loadOrders({signal,current});if(!current())return;orders=data;summary();},
  emails:async()=>{const data=await read('/emails');if(!current())return;$('#emails').replaceChildren(...data.map(e=>{const row=element('div',undefined,'email-row');row.append(element('span',e.email),button('Eliminar',async()=>{await api('/emails/'+e.id,'DELETE',{});if(current()){await run('emails');message('Email eliminado.');}}));return row;}));if(!data.length)$('#emails').append(element('p','Todavía no agregaste otros emails.','muted'));},
  addresses:async()=>{const data=await read('/direcciones');if(!current())return;addresses=data;summary();$('#addresses').replaceChildren(...data.map(d=>{const row=element('article',undefined,'address-row');row.append(element('strong',d.destinatario),element('p',`${d.calle}, ${d.ciudad} · ${d.departamento}`),button('Editar',()=>{for(const field of $('#address-form').elements)if(field.name)field.value=d[field.name]??'';$('#address-details').open=true;$('#address-form [name=destinatario]').focus();}),button('Eliminar',async()=>{await api('/direcciones/'+d.id,'DELETE',{});if(current()){await run('addresses');message('Dirección eliminada.');}}));const detail=[d.telefono&&'Teléfono: '+d.telefono,d.codigo_postal&&'CP: '+d.codigo_postal,d.pais&&'País: '+d.pais].filter(Boolean).join(' · ');if(detail)row.append(element('p',detail,'muted'));if(d.indicaciones)row.append(element('p','Indicaciones: '+d.indicaciones,'muted'));return row;}));if(!data.length)$('#addresses').append(element('p','Agregá tu primera dirección para tus próximas compras.','muted'));},
 };
 const run=name=>runSections({[name]:jobs[name]},{current,onState:state});
 $('#refresh-orders').onclick=async()=>{const b=$('#refresh-orders');b.disabled=true;try{await run('orders');}finally{b.disabled=false;}};
 summary();return runSections(jobs,{current,onState:state});
}
