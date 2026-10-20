// Read-only layout assertions for the documented Codex browser adapter.
// Import this module in cua_repl; pass an already-bound tab and viewport capability.
// No API mocks, route interception, database writes or hidden application state.
import assert from 'node:assert/strict';
export const responsiveViewports = [[320,720],[360,800],[375,812],[390,844],[430,932],[768,1024],[1024,768],[1440,900]];
export async function inspectResponsiveLayout(tab) {
  return tab.playwright.evaluate(() => {
    const visible = el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'; };
    const rect = el => { const r=el.getBoundingClientRect(); return {width:r.width,height:r.height}; };
    return {
      width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth,
      scrollWidth:document.documentElement.scrollWidth,
      heading:document.querySelector('h1')?.textContent.trim(),
      inputs:[...document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),select,textarea')].filter(visible).map(el=>({name:el.getAttribute('aria-label')||el.id||el.name,fontSize:+getComputedStyle(el).fontSize.replace("px", ""),...rect(el)})),
      dialogs:[...document.querySelectorAll('dialog[open]')].map(el=>{ const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,close:[...el.querySelectorAll('[data-close]')].filter(visible).map(rect)}; }),
      unnamedIconLinks:[...document.querySelectorAll('[data-account-link],[data-cart-link]')].filter(visible).filter(el=>!el.getAttribute('aria-label')&&!el.innerText.trim()).length,
      zoomDisabled:/maximum-scale\s*=\s*1|user-scalable\s*=\s*no/i.test(document.querySelector('meta[name=viewport]')?.content||'')
    };
  });
}
export function assertResponsiveLayout(result) {
  assert.ok(result.scrollWidth<=result.clientWidth+1,'Global horizontal overflow at '+result.width);
  assert.equal(result.unnamedIconLinks,0,'Navigation icon without accessible name');
  assert.equal(result.zoomDisabled,false,'Pinch zoom must remain enabled');
  if(result.width<=620)for(const input of result.inputs){assert.ok(input.fontSize>=16,'Small input font: '+input.name);assert.ok(input.height>=44,'Small input target: '+input.name);}
  for(const d of result.dialogs){assert.ok(d.left>=0&&d.top>=0&&d.right<=result.width&&d.bottom<=result.height,'Dialog exceeds viewport');for(const close of d.close)assert.ok(close.width>=44&&close.height>=44,'Small dialog close target');}
}
export async function checkResponsiveMatrix({tab,viewport,name,sizes=responsiveViewports}) {
  const results=[];
  for(const [width,height]of sizes){await viewport.set({width,height});const result=await inspectResponsiveLayout(tab);assertResponsiveLayout(result);results.push({name,status:'PASS',...result});}
  return results;
}
