const $=selector=>document.querySelector(selector);
export const element=(tag,text,className)=>{const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(className)n.className=className; return n;};
export function message(text,error=false){$('#message').textContent=text;$('#message').classList.toggle('error',error);}
export async function api(route,method='GET',body){
 const response=await fetch('/api'+route,{method,credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await response.json();}catch{throw Error('No pudimos conectar. Reintentá en unos segundos.');}
 if(!response.ok){if(response.status===401){for(const panel of ['admin-area','seller-area','customer-area'])$('#'+panel).hidden=true;$('#signin').hidden=false;$('#signin-layout').hidden=false;$('#session-actions').hidden=true;}if(response.status===403){$('#seller-area').hidden=true;$('#admin-area').hidden=true;$('#retry').hidden=false;}throw Object.assign(Error(data.error||'No se pudo completar la operación'),{status:response.status});}return data;
}
export function button(text,callback){const b=element('button',text,'button-secondary');b.type='button';b.onclick=async()=>{b.disabled=true;try{await callback();}catch(e){message(e.message,true);}finally{b.disabled=b.dataset.locked==='true';}};return b;}
export function overview(target,items){$(target).replaceChildren(...items.map(([label,value,note])=>{const card=element('article');card.append(element('span',label),element('strong',value),element('small',note));return card;}));}
function form(id,callback){const f=$(id);f.onsubmit=async event=>{event.preventDefault();if(f.dataset.busy)return;const data=Object.fromEntries(new FormData(f));f.dataset.busy='true';const controls=[...f.elements].map(x=>[x,x.disabled]);controls.forEach(([x])=>x.disabled=true);try{await callback(data,event);}catch(e){message(e.message,true);}finally{delete f.dataset.busy;controls.forEach(([x,disabled])=>x.disabled=disabled);if(id==='#signin')registrationFields();}};}
async function customer(user){
 const {loadOrders}=await import('./account-orders.js');
 const [profile,addresses,emails,orders]=await Promise.all([api('/perfil'),api('/direcciones'),api('/emails'),loadOrders()]);
 for(const k of ['nombre','telefono'])$('#profile').elements.namedItem(k).value=profile?.[k]||'';
 $('#access-email').value=user.email;
 overview('#customer-overview',[['Mis pedidos',orders.length,'Tus últimas compras'],['En curso',orders.filter(o=>!['entregado','cancelado'].includes(o.estado)).length,'Pedidos pendientes de completar'],['Direcciones',addresses.length,'Listas para tu próxima compra']]);
 $('#refresh-orders').onclick=async()=>{const b=$('#refresh-orders');b.disabled=true;try{const latest=await loadOrders();overview('#customer-overview',[['Mis pedidos',latest.length,'Tus últimas compras'],['En curso',latest.filter(o=>!['entregado','cancelado'].includes(o.estado)).length,'Pedidos pendientes de completar'],['Direcciones',addresses.length,'Listas para tu próxima compra']]);message('Pedidos actualizados.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
 $('#emails').replaceChildren(...emails.map(e=>{const row=element('div',undefined,'email-row');row.append(element('span',e.email),button('Eliminar',async()=>{await api('/emails/'+e.id,'DELETE',{});await customer(user);message('Email eliminado.');}));return row;}));
 if(!emails.length)$('#emails').append(element('p','Todavía no agregaste otros emails.','muted'));
 $('#addresses').replaceChildren(...addresses.map(d=>{const row=element('article',undefined,'address-row');row.append(element('strong',d.destinatario),element('p',`${d.calle}, ${d.ciudad} · ${d.departamento}`),button('Editar',()=>{for(const field of $('#address-form').elements)if(field.name)field.value=d[field.name]??'';$('#address-details').open=true;$('#address-form [name=destinatario]').focus();}),button('Eliminar',async()=>{await api('/direcciones/'+d.id,'DELETE',{});await customer(user);message('Dirección eliminada.');}));const detail=[d.telefono&&'Teléfono: '+d.telefono,d.codigo_postal&&'CP: '+d.codigo_postal,d.pais&&'País: '+d.pais].filter(Boolean).join(' · ');if(detail)row.append(element('p',detail,'muted'));if(d.indicaciones)row.append(element('p','Indicaciones: '+d.indicaciones,'muted'));return row;}));
 if(!addresses.length)$('#addresses').append(element('p','Agregá tu primera dirección para tus próximas compras.','muted'));
}
let currentUser;
async function load(){
 $('#loading').hidden=false;$('#retry').hidden=true;
 for(const panel of ['admin-area','seller-area','customer-area','signin','signin-layout','session-actions'])$('#'+panel).hidden=true;
 try{
  const {usuario}=await api('/sesion');currentUser=usuario;
  $('#identity').textContent=usuario?usuario.email:'Ingresá para encontrar todo lo que necesitás.';
  $('#signin').hidden=!!usuario;$('#signin-layout').hidden=!!usuario;$('#session-actions').hidden=!usuario;
  $('#account-title').replaceChildren(document.createTextNode(usuario?{cliente:'Tu espacio, tu ritual',vendedor:'Tus ventas, al día',administrador:'MateBreak, en orden'}[usuario.rol]||'Mi cuenta':'Tu próxima pausa'),element('span','.','accent'));
  if(!usuario)return true;
  $('#role').textContent={administrador:'Administrador',vendedor:'Vendedor',cliente:'Cliente'}[usuario.rol];
  if(usuario.rol==='administrador'){
   $('#admin-area').hidden=false;
   const {mountAdmin}=await import('./account-admin.js');await mountAdmin(usuario);
  }
  else if(usuario.rol==='vendedor'){const {mountSales}=await import('./sales.js');await mountSales();$('#seller-area').hidden=false;}
  else if(usuario.rol==='cliente'){await customer(usuario);$('#customer-area').hidden=false;}
  else throw Error('No pudimos verificar los permisos de tu cuenta.');
  return true;
 }catch(e){message(e.message,true);$('#retry').hidden=false;return false;}
 finally{$('#loading').hidden=true;}
}
form('#signin',async(data,event)=>{
 const action=$('#signin').dataset.mode;
 if(action==='registro'&&data.password!==data.confirmacion)throw Error('Las contraseñas no coinciden. Revisalas antes de continuar.');
 const {confirmacion,...fields}=data;const result=await api('/auth/'+action,'POST',fields);$('#signin [name=password]').value='';$('#signin [name=confirmacion]').value='';
 if(action==='registro'&&!result.sesion_iniciada){$('#signin').hidden=true;$('#register-success').hidden=false;$('#register-success-copy').textContent=result.mensaje;message('Revisá tu email para continuar.');return;}
 if(!await load())return;message('Ya ingresaste a tu cuenta.');
 if(currentUser?.rol==='cliente'&&new URLSearchParams(location.search).get('volver')==='carrito')location.assign('/carrito');
});
$('#signout').onclick=async()=>{const b=$('#signout');b.disabled=true;try{await api('/auth/logout','POST',{});for(const id of ['emails','addresses','sales-list','sale-lines','customer-orders','team-list'])$('#'+id).replaceChildren();$('#profile').reset();$('#address-form').reset();$('#sale-form').reset();authMode('login');await load();window.dispatchEvent(new CustomEvent('mb:cart',{detail:0}));message('Cerraste tu sesión.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
form('#profile',async data=>{await api('/perfil','PUT',data);message('Tus datos están guardados.');});
form('#email-form',async data=>{await api('/emails','POST',data);$('#email-form').reset();await customer(currentUser);message('Email guardado.');});
form('#address-form',async data=>{const {id,...fields}=data;await api('/direcciones'+(id?'/'+id:''),id?'PUT':'POST',fields);$('#address-form').reset();await customer(currentUser);$('#address-details').open=false;message('Dirección guardada.');});
$('#retry').onclick=load;
function registrationFields(){const register=$('#signin').dataset.mode==='registro';for(const id of ['register-name','register-confirm']){const label=$('#'+id);label.hidden=!register;label.querySelector('input').disabled=!register;label.querySelector('input').required=register;}}
function authMode(mode){if($('#signin').dataset.busy)return;const register=mode==='registro';$('#signin').dataset.mode=mode;$('#signin').hidden=false;$('#register-success').hidden=true;$('#login-tab').setAttribute('aria-selected',String(!register));$('#register-tab').setAttribute('aria-selected',String(register));$('#signin-title').textContent=register?'Tu lugar empieza acá.':'Qué bueno verte.';$('#signin-description').textContent=register?'Creá tu cuenta de cliente. Tus compras y tus datos, siempre a mano.':'Ingresá para acceder a tu espacio.';$('#signin-submit').textContent=register?'Crear mi cuenta →':'Ingresar a mi cuenta →';$('#signin [name=password]').autocomplete=register?'new-password':'current-password';$('#signin [name=password]').minLength=register?10:1;$('#register-hint').hidden=!register;registrationFields();}
$('#back-login').onclick=()=>authMode('login');
$('#new-address').onclick=()=>{$('#address-form').reset();$('#address-details').open=true;$('#address-form [name=destinatario]').focus();};
$('#login-tab').onclick=()=>authMode('login');$('#register-tab').onclick=()=>authMode('registro');
$('#password-toggle').onclick=()=>{const input=$('#signin [name=password]'),visible=input.type==='password';input.type=visible?'text':'password';$('#password-toggle').textContent=visible?'Ocultar':'Ver';$('#password-toggle').setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');$('#password-toggle').setAttribute('aria-pressed',String(visible));};
window.addEventListener('pageshow',event=>{if(event.persisted)load();});
if(new URLSearchParams(location.search).get('auth')==='error')message('No pudimos confirmar el acceso. El enlace puede haber vencido. Si ya confirmaste tu email, intentá iniciar sesión.',true);
load();
import './header-account.js';
