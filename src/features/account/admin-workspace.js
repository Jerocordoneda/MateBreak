const $=s=>document.querySelector(s);
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
export function renderInventory(rows){
 const total=key=>rows.reduce((sum,item)=>sum+Number(item[key]||0),0);
 $('#inventory-summary').textContent=total('disponible')+' disponibles · '+total('reservado')+' reservadas · ingresos, egresos, conteos y recepciones.';
}
