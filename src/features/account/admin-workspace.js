import {api,element,message,overview} from './ui.mjs';
const $=s=>document.querySelector(s), money=new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'});
let dispose;
export function mountAdminWorkspace(refresh){
  dispose?.();
  const links=[...document.querySelectorAll('.admin-navigation a')],panels=[...document.querySelectorAll('[data-admin-panel]')];
  const select=()=>{
    const active=links.find(link=>link.hash===location.hash)||links[0];
    for(const link of links)if(link===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    for(const panel of panels)panel.hidden='#'+panel.id!==active.hash;
  };
  select();window.addEventListener('hashchange',select);
  const navigate=event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();history.pushState(null,'',event.currentTarget.hash);select();};
  for(const link of links)link.addEventListener('click',navigate);
  let busy=false;
  const update=async()=>{
    if(busy||document.hidden||$('#admin-area').hidden)return;
    busy=true;
    try{await refresh();$('#admin-sync-status').textContent='Sincronizado '+new Date().toLocaleTimeString('es-AR')+' · actualización automática cada 15 segundos.';}
    catch(e){if(e.name!=='AbortError')$('#admin-sync-status').textContent='No pudimos sincronizar. Se reintentará automáticamente; podés usar Actualizar.';}
    finally{busy=false;}
  };
  const timer=setInterval(update,15000);
  document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);
  dispose=()=>{clearInterval(timer);for(const link of links)link.removeEventListener('click',navigate);window.removeEventListener('hashchange',select);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
  const stop=()=>{dispose?.();dispose=null;};
  window.addEventListener('mb:account-session-invalid',stop,{once:true});
  window.addEventListener('mb:account-session-reset',stop,{once:true});
}
let stock=[],reload;
function drawStock(){
  const query=$('#inventory-search').value.trim().toLocaleLowerCase('es-AR'), rows=stock.filter(s=>(s.nombre+' '+s.sku).toLocaleLowerCase('es-AR').includes(query));
  $('#inventory-count').textContent=`${rows.length} de ${stock.length} productos · costos unitarios en ARS. Se conservan en cada nueva venta; las ventas anteriores sin costo siguen señaladas.`;
  const target=$('#inventory-list');target.replaceChildren();
  for(const item of rows){
    const card=element('article',undefined,'admin-stock-row'),copy=element('div');
    copy.append(element('h3',item.nombre),element('small',item.sku),element('p',`${item.disponible} disponibles · ${item.reservado} reservadas · ${item.fisico} físicas`));
    const form=element('form',undefined,'stock-cost-form'),label=element('label','Costo unitario ARS'),input=element('input');
    input.name='costo_unitario';input.type='number';input.min='0';input.max='999999999';input.step='0.01';input.required=true;input.value=item.costo_unitario??'';input.placeholder='Sin costo cargado';label.append(input);
    const reasonLabel=element('label','Motivo del cambio'),reason=element('input');reason.name='motivo';reason.required=true;reason.minLength=3;reason.maxLength=500;reason.placeholder='Ej.: costo confirmado con proveedor';reasonLabel.append(reason);
    const save=element('button','Guardar costo','button-secondary');save.type='submit';form.append(label,reasonLabel,save);
    let pending,busy=false;
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;
      const data={costo_unitario:input.value,costo_esperado:item.costo_unitario==null?null:String(item.costo_unitario),motivo:reason.value.trim()};
      const signature=JSON.stringify(data);if(pending?.signature!==signature)pending={signature,id:crypto.randomUUID()};data.idempotencia=pending.id;
      busy=true;for(const control of form.elements)control.disabled=true;
      try{await api('/admin/inventario/'+item.id+'/costo','PUT',data);pending=null;item.costo_unitario=Number(input.value);reason.value='';message('Costo guardado y auditado. Se aplicará a las nuevas ventas.');await reload();}
      catch(e){message(e.message,true);}
      finally{busy=false;for(const control of form.elements)control.disabled=false;}
    };
    card.append(copy,form);target.append(card);
  }
  if(!rows.length)target.append(element('p','No hay productos que coincidan con la búsqueda.','muted'));
}
export function renderInventory(rows,refresh){
  stock=rows;reload=refresh;
  const total=key=>rows.reduce((sum,item)=>sum+Number(item[key]||0),0);
  overview('#inventory-overview',[
    ['Disponibles',total('disponible'),'Unidades libres para vender'],['Reservadas',total('reservado'),'Ventas y pedidos pendientes'],['Stock físico',total('fisico'),'Disponibles + reservadas']
  ]);
  $('#inventory-summary').textContent=`${total('disponible')} disponibles · ${total('reservado')} reservadas · ingresos, egresos, conteos y recepciones.`;
  $('#inventory-search').oninput=drawStock;
  // Background refresh must not erase an operator's cost draft or focus.
  if(!$('#inventory-list').contains(document.activeElement)&&![...document.querySelectorAll('.stock-cost-form [name=motivo]')].some(input=>input.value))drawStock();
}
