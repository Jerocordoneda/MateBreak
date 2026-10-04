import {returnPath} from './return-path.mjs';
const parameters=new URLSearchParams(location.hash.slice(1)),token_hash=parameters.get('token_hash'),type=parameters.get('type'),volver=parameters.get('volver');
history.replaceState(null,'',location.pathname);
const button=document.querySelector('#confirm-account'),message=document.querySelector('#confirmation-status');
if(!token_hash||type!=='email'){button.disabled=true;message.textContent='El enlace de confirmación es inválido. Abrí el enlace completo del correo o iniciá sesión si ya confirmaste tu cuenta.';}
button.onclick=async()=>{button.disabled=true;message.textContent='Verificando tu correo…';try{const response=await fetch('/api/auth/confirmar',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token_hash,type,volver:returnPath(volver)?volver:null})});const data=await response.json();if(!response.ok)throw Error(data.error);message.textContent='Tu correo quedó confirmado.';location.replace(data.next);}catch(e){message.textContent=e.message||'No pudimos verificar tu correo. Reintentá.';button.disabled=false;}};
