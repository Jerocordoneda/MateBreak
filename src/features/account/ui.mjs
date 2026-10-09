const $=selector=>document.querySelector(selector);
export const element=(tag,text,className)=>{const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(className)n.className=className; return n;};
export function message(text,error=false){$('#message').textContent=text;$('#message').classList.toggle('error',error);}
let requestScope;
export function setRequestScope(signal){requestScope=signal;}
export async function api(route,method='GET',body,{signal=requestScope,timeoutMs=20000}={}){
 const readSignal=method==='GET'?AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(timeoutMs)]):undefined;
 const response=await fetch('/api'+route,{method,credentials:'same-origin',cache:'no-store',signal:readSignal,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 let data;try{data=await response.json();}catch{throw Error('No pudimos conectar. Reintentá en unos segundos.');}
 if(!response.ok){if(response.status===401){window.dispatchEvent(new Event('mb:account-session-invalid'));for(const panel of ['admin-area','seller-area','customer-area'])$('#'+panel).hidden=true;$('#signin').hidden=false;$('#signin-layout').hidden=false;$('#session-actions').hidden=true;}if(response.status===403){$('#seller-area').hidden=true;$('#admin-area').hidden=true;$('#retry').hidden=false;}throw Object.assign(Error(data.error||'No se pudo completar la operación'),{status:response.status});}return data;
}
export function button(text,callback){const b=element('button',text,'button-secondary');b.type='button';b.onclick=async()=>{b.disabled=true;try{await callback();}catch(e){message(e.message,true);}finally{b.disabled=b.dataset.locked==='true';}};return b;}
export function overview(target,items){$(target).replaceChildren(...items.map(([label,value,note])=>{const card=element('article');card.append(element('span',label),element('strong',value),element('small',note));return card;}));}
