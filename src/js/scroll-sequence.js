document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-scroll-sequence]').forEach(initSequence);
});

function initSequence(section) {
  if (section.dataset.sequenceMounted) return;
  const img = section.querySelector('[data-seq-img]');
  if (!img) return;
  section.dataset.sequenceMounted = 'true';
  const total = parseInt(section.dataset.seqFrames || '60', 10);
  const dir = section.dataset.seqDir || '/src/assets/images/frames-mate1';
  const frames = Array.from({length:total}, (_, index) => {
    const n=index+1, suffix=n>1&&n<=47?'-convertido-de-png':'';
    return `${dir}/ezgif-frame-${String(n).padStart(3,'0')}-removebg-preview${suffix}.webp`;
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const loaded = new Map(), loading = new Map();
  let active=true, target=0, shown=0, raf=null, pointer=null, originX=0, originFrame=0, manual=false;
  function load(index) {
    if(index<0||index>=total||loaded.has(index)||loading.has(index))return;
    const image=new Image();loading.set(index,image);
    image.onload=()=>{loading.delete(index);loaded.set(index,image);if(Math.round(target)===index)requestPaint();};
    image.onerror=()=>loading.delete(index);image.src=frames[index];
  }
  function preload(index) {for(let offset=-2;offset<=2;offset++)load(index+offset);}
  function paint() {
    raf=null;
    const next=Math.round(target);
    if(loaded.has(next)) {
      img.src=frames[next];shown=next;
      section.querySelector('[data-seq-counter]')?.replaceChildren(String(next+1).padStart(2,'0'));
      const bar=section.querySelector('[data-seq-bar]');if(bar)bar.style.transform=`scaleX(${next/(total-1)})`;
    }
  }
  function requestPaint() {if(raf===null&&active)raf=requestAnimationFrame(paint);}
  function seek(frame) {
    target=Math.max(0,Math.min(total-1,frame));preload(Math.round(target));requestPaint();
    img.setAttribute('aria-valuenow',String(Math.round(target)+1));
  }
  function scroll() {
    if(!active||manual||reduced.matches||matchMedia('(max-width:760px)').matches)return;
    const rect=section.getBoundingClientRect();
    const progress=Math.max(0,Math.min(1,(innerHeight-rect.top)/(Math.max(rect.height,innerHeight))));
    seek(progress*(total-1));
  }
  img.tabIndex=0;img.setAttribute('role','slider');img.setAttribute('aria-label','Explorá el mate: arrastrá horizontalmente o usá las flechas');
  img.setAttribute('aria-valuemin','1');img.setAttribute('aria-valuemax',String(total));img.setAttribute('aria-valuenow','1');
  img.addEventListener('pointerdown',event=>{
    if(event.isPrimary===false||event.button!==0)return;
    pointer=event.pointerId;originX=event.clientX;originFrame=shown;manual=true;
    img.setPointerCapture(pointer);section.classList.add('mb-sequence-dragging');
  });
  img.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointer)return;
    seek(originFrame+(event.clientX-originX)/Math.max(4,img.clientWidth/(total-1)));
  });
  const release=()=>{pointer=null;section.classList.remove('mb-sequence-dragging');};
  img.addEventListener('pointerup',release);img.addEventListener('pointercancel',release);img.addEventListener('lostpointercapture',release);
  img.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();manual=true;
    seek(event.key==='Home'?0:event.key==='End'?total-1:target+(event.key==='ArrowRight'?1:-1));
  });
  new IntersectionObserver(entries=>{
    active=entries[0].isIntersecting;
    if(active){preload(Math.round(target));scroll();requestPaint();}
    else if(raf!==null){cancelAnimationFrame(raf);raf=null;}
  },{rootMargin:'150px'}).observe(section);
  window.addEventListener('scroll',scroll,{passive:true});window.addEventListener('resize',scroll,{passive:true});
  reduced.addEventListener('change',()=>{if(reduced.matches&&raf!==null){cancelAnimationFrame(raf);raf=null;}scroll();});
  load(0);
}
