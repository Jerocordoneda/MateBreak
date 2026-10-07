import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../src/js/scroll-sequence.js',import.meta.url),'utf8');
function sequence({width,reduced,home=true}) {
 const events={},queue=[],queries=[],preloaded=[];
 const img={src:'first.webp',style:{}};
 const counter={textContent:''},bar={style:{}};
 let top=0;
 const section={dataset:{seqFrames:'60'},closest:()=>home?{}:null,querySelector:s=>s==='[data-seq-img]'?img:s==='[data-seq-counter]'?counter:bar,getBoundingClientRect:()=>({top,height:1800})};
 runInNewContext(source,{document:{addEventListener:(_,f)=>f(),querySelectorAll:()=>[section]},window:{innerHeight:900,addEventListener:(n,f)=>events[n]=f},matchMedia:q=>{queries.push(q);return {matches:width<=760||(q.includes('prefers-reduced-motion')&&reduced),addEventListener(){},removeEventListener(){}};},Image:class{set src(v){preloaded.push(v);}},requestAnimationFrame:f=>{queue.push(f);return queue.length;},cancelAnimationFrame(){}});
 const drain=()=>{let n=0;while(queue.length&&n++<400)queue.shift()();assert.ok(n<400);};
 drain();
 return {img,counter,queries,preloaded,scrollToEnd(){top=-900;events.scroll?.();drain();}};
}
for(const reduced of [false,true])test(`Home desktop scroll reaches frame 060 with reduced motion ${reduced}`,()=>{
 const result=sequence({width:1440,reduced});
 assert.equal(result.preloaded.length,60);
 result.scrollToEnd();assert.match(result.img.src,/frame-060-removebg-preview.webp$/);assert.equal(result.counter.textContent,'60');
});
test('Home mobile stays static and does not preload frames',()=>{
 const result=sequence({width:390,reduced:false});result.scrollToEnd();assert.equal(result.img.src,'first.webp');assert.equal(result.preloaded.length,0);
});
test('Other pages still respect reduced motion',()=>{
 const result=sequence({width:1440,reduced:true,home:false});assert.equal(result.preloaded.length,0);
});
