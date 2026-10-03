import {returnPath} from './return-path.mjs';
const returnIntent=new URLSearchParams(location.search).get('volver');
import {element,message,api,button,overview,setRequestScope} from './ui.mjs';
const $=selector=>document.querySelector(selector);
export {element,message,api,button,overview} from './ui.mjs';
function form(id,callback){const f=$(id);f.onsubmit=async event=>{event.preventDefault();if(f.dataset.busy)return;const data=Object.fromEntries(new FormData(f));f.dataset.busy='true';const controls=[...f.elements].map(x=>[x,x.disabled]);controls.forEach(([x])=>x.disabled=true);try{await callback(data,event);}catch(e){message(e.message,true);}finally{delete f.dataset.busy;controls.forEach(([x,disabled])=>x.disabled=disabled);if(id==='#signin')registrationFields();}};}
async function customer(user){
 const epoch=revision,signal=controller?.signal;
 const {mountCustomer}=await import('./customer-panel.js');
 if(revision!==epoch||!user)return;
 return mountCustomer(user,{signal,current:()=>revision===epoch&&!signal?.aborted});
}
let currentUser,revision=0,controller;
function clearCustomer(){for(const id of ['emails','addresses','customer-orders','customer-overview'])$('#'+id).replaceChildren();$('#profile').reset();$('#access-email').value='';}
window.addEventListener('mb:account-session-invalid',()=>{revision++;controller?.abort();currentUser=null;clearCustomer();$('#loading').hidden=true;$('#role').textContent='';$('#identity').textContent='Ingresá para encontrar todo lo que necesitás.';});
async function load(){
 const epoch=++revision;controller?.abort();controller=new AbortController();setRequestScope(controller.signal);clearCustomer();
 $('#identity').textContent='Verificando tu sesión…';$('#role').textContent='';
 $('#loading').hidden=false;$('#retry').hidden=true;
 for(const panel of ['admin-area','seller-area','customer-area','signin','signin-layout','session-actions'])$('#'+panel).hidden=true;
 try{
  const {usuario}=await api('/sesion');if(epoch!==revision)return false;currentUser=usuario;
  $('#identity').textContent=usuario?usuario.email:'Ingresá para encontrar todo lo que necesitás.';
  $('#signin').hidden=!!usuario;$('#signin-layout').hidden=!!usuario;$('#session-actions').hidden=!usuario;
  $('#account-title').replaceChildren(document.createTextNode(usuario?{cliente:'Tu espacio, tu ritual',vendedor:'Tus ventas, al día',administrador:'MateBreak, en orden'}[usuario.rol]||'Mi cuenta':'Tu próxima pausa'),element('span','.','accent'));
  if(!usuario)return true;
  if(returnPath(returnIntent)==='/mayorista'){location.replace('/mayorista');return true;}
  $('#role').textContent={administrador:'Administrador',vendedor:'Vendedor',cliente:'Cliente'}[usuario.rol];
  if(usuario.rol==='administrador'){
   $('#admin-area').hidden=false;
   const {mountAdmin}=await import('./account-admin.js');if(epoch!==revision)return false;await mountAdmin(usuario);
  }
  else if(usuario.rol==='vendedor'){const {mountSales}=await import('./sales.js');if(epoch!==revision)return false;await mountSales();if(epoch!==revision)return false;$('#seller-area').hidden=false;}
  else if(usuario.rol==='cliente'){$('#customer-area').hidden=false;$('#loading').hidden=true;void customer(usuario).catch(e=>{if(epoch===revision)message(e.message,true);});}
  else throw Error('No pudimos verificar los permisos de tu cuenta.');
  return true;
 }catch(e){if(epoch===revision){message(e.name==='TimeoutError'?'La verificación está demorando. Podés volver a intentar.':e.message,true);$('#retry').hidden=false;}return false;}
 finally{if(epoch===revision)$('#loading').hidden=true;}
}
form('#signin',async(data,event)=>{
 const action=$('#signin').dataset.mode;
 if(action==='registro'&&data.password!==data.confirmacion)throw Error('Las contraseñas no coinciden. Revisalas antes de continuar.');
 const {confirmacion,...fields}=data;const result=await api('/auth/'+action,'POST',{...fields,...(returnPath(returnIntent)?{volver:returnIntent}:{})});$('#signin [name=password]').value='';$('#signin [name=confirmacion]').value='';
 if(action==='registro'&&!result.sesion_iniciada){$('#signin').hidden=true;$('#register-success').hidden=false;$('#register-success-copy').textContent=result.mensaje;message('Revisá tu email para continuar.');return;}
 if(!await load())return;message('Ya ingresaste a tu cuenta.');
 if(currentUser?.rol==='cliente'&&new URLSearchParams(location.search).get('volver')==='carrito')location.assign('/carrito');
});
$('#signout').onclick=async()=>{const b=$('#signout');b.disabled=true;try{await api('/auth/logout','POST',{});revision++;controller?.abort();currentUser=null;clearCustomer();for(const id of ['emails','addresses','sales-list','sale-lines','customer-orders','team-list'])$('#'+id).replaceChildren();$('#profile').reset();$('#address-form').reset();$('#sale-form').reset();authMode('login');await load();window.dispatchEvent(new CustomEvent('mb:cart',{detail:0}));message('Cerraste tu sesión.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
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
if(returnPath(returnIntent)==='/mayorista')$('#signin-description').textContent='Ingresá o creá tu cuenta para continuar con tu pedido mayorista.';
if(new URLSearchParams(location.search).get('auth')==='error')message('No pudimos confirmar el acceso. El enlace puede haber vencido. Si ya confirmaste tu email, intentá iniciar sesión.',true);
load();
