import {api,element,button,message} from './ui.mjs';
import {dateTime,filterRecords} from './account-data.js';
const $=s=>document.querySelector(s);
const labels={cliente:'Cliente',vendedor:'Vendedor',administrador:'Administrador'};
export async function mountTeam(currentUser){
 let page=1,busy=false,users=[];
 function render(){
  const visible=filterRecords(users,$('#team-search').value,$('#team-filter').value,u=>u.email+' '+u.nombre,'rol');
  const count=role=>users.filter(u=>u.rol===role).length;
  $('#team-summary').textContent=`${visible.length} de ${users.length} cuentas · ${count('cliente')} clientes · ${count('vendedor')} vendedores · ${count('administrador')} administradores · ${users.filter(u=>!u.confirmado).length} sin confirmar`;
  $('#team-list').replaceChildren(...visible.map(user=>{
   const row=element('div',undefined,'team-row'),identity=element('div');
   identity.append(element('strong',user.email||'Cuenta sin email'),element('small',user.id===currentUser.id?'Tu cuenta · acceso protegido':user.confirmado?'Email confirmado':'Pendiente de confirmar el email'));
   if(user.nombre)identity.append(element('small','Nombre de registro: '+user.nombre));
   identity.append(element('small','Creada: '+dateTime(user.creado_en)),element('small','Último ingreso: '+dateTime(user.ultimo_acceso,'Todavía no ingresó')));
   const select=element('select');select.setAttribute('aria-label','Rol de '+user.email);
   for(const [value,label] of Object.entries(labels)){const option=element('option',label);option.value=value;option.disabled=!user.confirmado&&value!=='cliente';select.append(option);}select.value=user.rol;
   const save=button('Guardar',async()=>{
    if(select.value==='administrador'&&!window.confirm(`¿Dar acceso completo de administrador a ${user.email}?`))return;
    select.disabled=true;
    try{const result=await api('/admin/usuarios/'+user.id+'/rol','PUT',{rol:select.value,anterior:user.rol});user.rol=result.rol;message(`${user.email} ahora tiene el rol ${labels[result.rol].toLowerCase()}.`);render();}
    catch(e){select.value=user.rol;throw e;}
    finally{select.disabled=user.id===currentUser.id;save.dataset.locked=String(select.value===user.rol);}
   });
   select.disabled=user.id===currentUser.id;save.disabled=true;select.onchange=()=>{save.disabled=select.value===user.rol;save.dataset.locked=String(save.disabled);};
   row.append(identity,select,save);return row;
  }));
  if(!visible.length)$('#team-list').append(element('p',users.length?'No hay coincidencias en esta página. Probá otro filtro o página.':'No hay más cuentas en esta página.','muted'));
 }
 async function refresh(){
  if(busy)return;busy=true;$('#refresh-team').disabled=true;$('#team-prev').disabled=true;$('#team-next').disabled=true;
  try{
   const data=await api('/admin/usuarios?pagina='+page);
   users=data.usuarios;render();
   $('#team-page').textContent='Página '+page;$('#team-prev').disabled=page===1;$('#team-next').disabled=!data.siguiente;
  }finally{busy=false;$('#refresh-team').disabled=false;}
 }
 const run=async()=>{try{await refresh();}catch(e){message(e.message,true);}};
 $('#refresh-team').onclick=run;$('#team-prev').onclick=()=>{page--;run();};$('#team-next').onclick=()=>{page++;run();};
 $('#team-search').oninput=render;$('#team-filter').onchange=render;
 await refresh();
}
