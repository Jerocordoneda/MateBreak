const $=id=>document.getElementById(id), labels={pendiente:'Pendiente',procesando:'Importando',importado:'Importado',error:'Error reintentable',revision:'Revisión manual requerida'};
let page=1;
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
async function api(url,body){const r=await fetch('/api/admin/logistica'+url,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo completar la operación');return data;}
function card(b){
 const article=node('article'),title=node('h2',`Bulto ${b.parcelNumber} · ${labels[b.state]||b.state}`),dl=node('dl');article.append(title,dl);
 for(const [label,value]of[['Pedido',b.orderId],['Referencia externa',b.extOrderId],['Intentos',b.attempts],['Último intento',b.lastAttemptAt||'Sin intentos'],['Error sanitizado',b.errorType||'—'],['createdAt oficial',b.createdAt||'—']])dl.append(node('dt',label),node('dd',String(value)));
 const history=node('button','Ver auditoría'),audit=node('pre');history.onclick=async()=>{try{audit.textContent=JSON.stringify(await api(`/${b.orderId}/${b.parcelNumber}/historial`),null,2);}catch(e){$('message').textContent=e.message;}};article.append(history,audit);
 if(!['revision','error'].includes(b.state)&&!b.abandoned)return article;
 const form=node('form');form.className='action';
 const select=node('select');select.setAttribute('aria-label','Acción de conciliación');
 for(const [value,text]of[['keep_review','Mantener en revisión'],['verified_import','Marcar importado: existencia verificada'],['safe_retry','Autorizar retry: ausencia verificada']]){if(b.state==='procesando'&&value!=='keep_review'||b.attempts>=3&&value==='safe_retry')continue;const o=node('option',text);o.value=value;select.append(o);}
 const source=node('select');source.setAttribute('aria-label','Fuente oficial');for(const [value,text]of[['portal','Portal MiCorreo'],['support','Soporte Correo Argentino']]){const o=node('option',text);o.value=value;source.append(o);}
 const reference=node('input');reference.placeholder='Referencia del caso, sin datos ni secretos';reference.maxLength=80;reference.setAttribute('aria-label','Referencia de verificación');
 const created=node('input');created.placeholder='createdAt oficial con zona, ej. 2026-10-01T12:00:00Z';created.setAttribute('aria-label','createdAt oficial');
 const confirmed=node('input');confirmed.type='checkbox';const confirmation=node('label');confirmation.className='confirmation';confirmation.append(confirmed,node('span','Confirmé existencia o ausencia por el medio oficial indicado. No es una suposición.'));
 const submit=node('button','Registrar acción auditada');submit.type='submit';form.append(select,source,reference,created,confirmation,submit);
 const change=()=>{const review=select.value==='keep_review';source.hidden=reference.hidden=confirmation.hidden=review;created.hidden=select.value!=='verified_import';};select.onchange=change;change();
 let pending=null;
 form.onsubmit=async e=>{e.preventDefault();const body={action:select.value,expectedState:b.state,expectedAttempts:b.attempts,expectedClaimId:b.claimId};
  if(body.action!=='keep_review')Object.assign(body,{confirmed:confirmed.checked,source:source.value,reference:reference.value.trim()});
  if(body.action==='verified_import')body.createdAt=created.value.trim();
  const key=JSON.stringify(body);if(!pending||pending.key!==key)pending={key,id:crypto.randomUUID()};body.actionId=pending.id;
  submit.disabled=true;try{await api(`/${b.orderId}/${b.parcelNumber}/acciones`,body);await load();$('message').textContent='Acción registrada. No se llamó al proveedor.';}catch(error){$('message').textContent=error.message;}finally{submit.disabled=false;}
 };article.append(form);return article;
}
async function load(){try{const rows=await api(`?page=${page}&state=${encodeURIComponent($('state').value)}`);$('rows').replaceChildren(...rows.map(card));$('message').textContent=rows.length?'':'Sin bultos para este filtro';$('page').textContent=`Página ${page}`;$('previous').disabled=page===1;$('next').disabled=rows.length<50;}catch(e){$('message').textContent=e.message;}}
$('filters').onsubmit=e=>{e.preventDefault();page=1;load();};$('previous').onclick=()=>{if(page>1)page--;load();};$('next').onclick=()=>{page++;load();};load();
