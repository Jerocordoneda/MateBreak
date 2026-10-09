// A native player is created only after an explicit visitor action. No API SDK or autoplay.
const container=document.querySelector('#podcast-player'),button=document.querySelector('#podcast-load'),status=document.querySelector('#podcast-player-status');
button.addEventListener('click',()=>{
 const frame=document.createElement('iframe');
 const url=new URL('https://www.youtube-nocookie.com/embed/'+container.dataset.video);
 url.search=new URLSearchParams({start:container.dataset.start,autoplay:'0',controls:'1',playsinline:'1',rel:'0'});
 frame.src=url.href;frame.title='MateBreak Podcast · Cómo Vender Miles de Productos por Internet | Álvaro de Voltra · Episodio 12';
 frame.allow='encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;
 frame.referrerPolicy='strict-origin-when-cross-origin';frame.tabIndex=0;
 status.textContent='Usá los controles para reproducir. Si el video no carga, podés abrirlo en YouTube.';
 frame.addEventListener('error',()=>{status.textContent='No pudimos cargar el reproductor. Podés ver el episodio en YouTube.';});
 container.replaceChildren(frame);frame.focus();
},{once:true});
