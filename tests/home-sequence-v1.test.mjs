import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../src/js/scroll-sequence.js',import.meta.url),'utf8');
function sequence({width=1440,reduced=false,home=true,fail=false}={}) {
 const events={},queue=new Map(),queries=[],preloaded=[],media=[];
 const img={src:'first.webp',style:{}},counter={textContent:''},bar={style:{}};
 let top=0,clock=0,id=0;
 const document={hidden:false,addEventListener:(n,f)=>{if(n==='DOMContentLoaded')f();else events[n]=f;},querySelectorAll:()=>[section]};
 const section={dataset:{seqFrames:'60'},closest:()=>home?{}:null,querySelector:s=>s==='[data-seq-img]'?img:s==='[data-seq-counter]'?counter:bar,getBoundingClientRect:()=>({top,bottom:top+1800,height:1800})};
 const context={document,window:{innerHeight:900,addEventListener:(n,f)=>events[n]=f},matchMedia:q=>{queries.push(q);const m={matches:width<=760||(q.includes('prefers-reduced-motion')&&reduced),addEventListener(n,f){this.change=f;},removeEventListener(){}};media.push(m);return m;},Image:class{async decode(){} set src(v){preloaded.push(v);queueMicrotask(()=>fail?this.onerror():this.onload());}},requestAnimationFrame:f=>{queue.set(++id,f);return id;},cancelAnimationFrame:n=>queue.delete(n)};
 runInNewContext(source,context);
 const drain=async()=>{for(let n=0;n<120;n++){await Promise.resolve();await Promise.resolve();const current=[...queue.values()];queue.clear();clock+=1000/60;current.forEach(f=>f(clock));}assert.equal(queue.size,0,'RAF stops after settling');};
 return {img,counter,queries,preloaded,queue,context,drain,scroll(topValue){top=topValue;events.scroll?.();},mobile(){media[0].matches=true;media[0].change();},hidden(){document.hidden=true;events.visibilitychange();}};
}
for(const reduced of [false,true])test(`Home desktop frame 060, bounded preload, reverse and no flicker; reduced motion ${reduced}`,async()=>{
 const r=sequence({reduced});await r.drain();assert.ok(r.preloaded.length<=13,'Opening Home does not request all 60');
 r.scroll(-899);await r.drain();assert.match(r.img.src,/frame-060-removebg-preview.webp$/);assert.equal(r.counter.textContent,'60');
 r.scroll(899);await r.drain();assert.match(r.img.src,/frame-001-removebg-preview.webp$/);assert.equal(r.img.style.opacity,undefined);
 assert.equal(new Set(r.preloaded).size,r.preloaded.length,'Decoded frames are reused');
 const count=r.preloaded.length;r.scroll(-2000);await r.drain();assert.equal(r.preloaded.length,count,'Offscreen does not preload');
});
test('Time smoothing is independent of refresh rate',()=>{
 const r=sequence();for(const hz of [60,120,144]){let p=0;for(let n=0;n<hz;n++)p+=(1-p)*r.context.sequenceInterpolationAlpha(1000/hz);assert.ok(Math.abs(p-(1-Math.exp(-1000/18)))<1e-9);}
});
test('Home mobile and other reduced-motion pages do not preload',async()=>{
 for(const config of [{width:390},{width:760},{reduced:true,home:false}]){const r=sequence(config);r.scroll(-899);await r.drain();assert.equal(r.img.src,'first.webp');assert.equal(r.preloaded.length,0);}
});
test('Failed images keep the displayed image; hidden tab and resize stop work',async()=>{
 const failed=sequence({fail:true});await failed.drain();assert.equal(failed.img.src,'first.webp');assert.ok(failed.preloaded.length<=13);
 const r=sequence();await r.drain();r.hidden();assert.equal(r.queue.size,0);r.mobile();assert.match(r.img.src,/frame-001-/);assert.equal(r.img.style.filter,'');
});
