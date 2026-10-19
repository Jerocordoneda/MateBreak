import {fetchJson} from '../../services/http.mjs';
const $=s=>document.querySelector(s),status=$('#recovery-message'),retry=$('#recovery-retry');
function api(path,body){return fetchJson('/api/auth/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined},'No pudimos completar la operación.');}
for(const [id,path]of [['recovery-request','recover'],['recovery-password','password']])$('#'+id).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');if(b.disabled)return;b.disabled=true;try{const d=Object.fromEntries(new FormData(f));if(path==='password'&&d.password!==d.confirmacion)throw Error('Las contraseñas no coinciden.');const r=await api(path,path==='password'?{password:d.password}:d);f.reset();status.textContent=r.mensaje||'Tu contraseña está guardada. Volvé a iniciar sesión.';if(path==='password')f.hidden=true;}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};
const state=new URLSearchParams(location.search).get('estado');
// A cold server must not send the shopper to request another link: let them retry the check.
async function checkLink(){retry.hidden=true;$('#recovery-request').hidden=true;try{await api('recovery-status');$('#recovery-password').hidden=false;status.textContent='Elegí una contraseña de entre 10 y 128 caracteres.';}catch(e){retry.hidden=!e.retryable;$('#recovery-request').hidden=Boolean(e.retryable);status.textContent=e.message;}}
retry.onclick=checkLink;
if(state==='cambiar')await checkLink();
if(state==='invalido')status.textContent='El enlace venció o no es válido. Solicitá uno nuevo en este navegador.';
window.addEventListener('pageshow',e=>{if(e.persisted){$('#recovery-password').reset();location.reload();}});
