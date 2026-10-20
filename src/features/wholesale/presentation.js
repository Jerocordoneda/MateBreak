for(const link of document.querySelectorAll('[data-wholesale-entry]'))link.addEventListener('click',async event=>{
 event.preventDefault();if(link.getAttribute('aria-busy')==='true')return;
 link.setAttribute('aria-busy','true');const status=document.querySelector('[data-wholesale-entry-status]');
 status.textContent='Verificando tu sesión…';
 try{const response=await fetch('/api/sesion',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('No pudimos verificar tu sesión. Volvé a intentar.');const data=await response.json();location.assign(data.usuario?'/mayorista':'/mi-cuenta?volver=mayorista');}
 catch(error){status.textContent=error.name==='TimeoutError'?'La verificación está demorando. Volvé a intentar.':error.message;link.removeAttribute('aria-busy');}
});
