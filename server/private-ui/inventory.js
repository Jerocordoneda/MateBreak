const $ = selector => document.querySelector(selector);
const fmt = value => new Intl.NumberFormat('es-UY').format(value);
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
let products = [], selected, pending, busy = false, historySequence = 0;
const types = { inicial: 'Carga inicial', ingreso: 'Ingreso', egreso: 'Egreso', conteo: 'Conteo físico', reserva: 'Reserva', liberacion: 'Liberación' };
async function api(route, options = {}) {
  const response = await fetch('/api' + route, { credentials: 'same-origin', ...options, headers: { ...options.headers, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  const data = await response.json();
  if (!response.ok) {
    if ([401,403].includes(response.status)) {
      products = []; $('#inventory').replaceChildren(); $('#history').replaceChildren();
      for (const id of ['total','available','reserved','attention']) $('#' + id).textContent = '—';
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    }
    throw Object.assign(Error(data.error || 'No se pudo completar la solicitud'), { status: response.status });
  }
  return data;
}
function message(text, error = false) { const el = $('#message'); el.textContent = text; el.className = 'message' + (error ? ' error' : ''); el.hidden = false; }
function hasAlert(p) { return p.abastecimiento === 'stock' && (p.disponible === 0 || p.disponible < p.minimo); }
function render() {
  $('#total').textContent = fmt(products.reduce((sum,p) => sum+p.fisico,0));
  $('#available').textContent = fmt(products.reduce((sum,p) => sum+p.disponible,0));
  $('#reserved').textContent = fmt(products.reduce((sum,p) => sum+p.reservado,0));
  $('#attention').textContent = fmt(products.filter(hasAlert).length);
  const search = $('#search').value.trim().toLocaleLowerCase('es'), filter = $('#filter').value;
  const list = products.filter(p => [p.nombre,p.sku,p.material,p.categoria].join(' ').toLocaleLowerCase('es').includes(search) && (filter === 'todos' || filter === 'atencion' && hasAlert(p) || filter === 'aproximado' && p.aproximado || filter === 'a_pedido' && p.abastecimiento === 'a_pedido'));
  $('#count').textContent = list.length;
  $('#inventory').replaceChildren(...list.map(p => {
    const row = node('tr'), title = node('td');
    title.append(node('span',p.nombre,'product-name'),node('span',p.sku + ' · ' + (p.diseno || p.categoria),'sku'));
    row.append(title,node('td',fmt(p.fisico),'number'),node('td',fmt(p.reservado),'number'),node('td',fmt(p.disponible),'number available'));
    ['Físico','Reservado','Disponible'].forEach((label,i) => row.children[i+1].prepend(node('span',label,'column-label')));
    const state = node('td'), badges = node('div',undefined,'badges');
    badges.append(node('span',p.aproximado ? 'Aproximado' : 'Contado',p.aproximado ? 'badge' : 'badge good'));
    if (p.abastecimiento === 'a_pedido') badges.append(node('span','A pedido','badge order'));
    if (hasAlert(p)) badges.append(node('span',p.disponible === 0 ? 'Sin stock' : 'Stock bajo','badge low'));
    state.append(badges); row.append(state);
    const actions = node('td'), group = node('div',undefined,'row-actions');
    const adjust = node('button','Ajustar'); adjust.addEventListener('click',() => openAdjust(p)); adjust.setAttribute('aria-label','Ajustar ' + p.nombre);
    const history = node('button','↗','quiet icon-button'); history.title = 'Ver movimientos'; history.setAttribute('aria-label','Movimientos de ' + p.nombre); history.addEventListener('click',() => loadHistory(p).catch(e => message(e.message,true)));
    const settings = node('button','⋯','quiet icon-button'); settings.title = 'Configurar ficha'; settings.setAttribute('aria-label','Configurar ' + p.nombre); settings.addEventListener('click',() => openSettings(p));
    group.append(adjust,history,settings); actions.append(group); row.append(actions); return row;
  }));
  if (!list.length) { const row = node('tr'), cell = node('td','No hay artículos para este filtro.','empty'); cell.colSpan = 6; row.append(cell); $('#inventory').append(row); }
}
async function loadHistory(product) {
  const sequence = ++historySequence;
  const movements = await api('/admin/inventario/historial' + (product ? '?producto_id=' + encodeURIComponent(product.id) : ''));
  if (sequence !== historySequence) return;
  $('#history-title').textContent = product ? 'Movimientos · ' + product.nombre : 'Últimos movimientos';
  $('#all-history').hidden = !product;
  $('#history').replaceChildren(...movements.map(m => {
    const row = node('article',undefined,'movement');
    const delta = node('span',(m.diferencia > 0 ? '+' : '') + fmt(m.diferencia),'delta' + (m.diferencia < 0 ? ' negative' : ''));
    const details = node('div'); details.append(node('strong',m.nombre + ' · ' + (types[m.tipo] || m.tipo)),node('p',m.motivo));
    details.append(node('small',m.actor_nombre + (m.disponible_anterior !== null ? ' · Disponible: ' + fmt(m.disponible_anterior) + ' → ' + fmt(m.disponible_nuevo) : '') + (m.pedido_id ? ' · Pedido ' + m.pedido_id.slice(0,8) : '')));
    const date = new Date(m.creado_en), time = node('time',date.toLocaleString('es-UY',{dateStyle:'short',timeStyle:'short'})); time.dateTime = date.toISOString();
    row.append(delta,details,time); return row;
  }));
  if (!movements.length) $('#history').append(node('p','Todavía no hay movimientos.','empty'));
  if (product) $('#history-title').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function refresh() {
  $('#refresh').disabled = true;
  try { products = await api('/admin/inventario'); render(); await loadHistory(); }
  finally { $('#refresh').disabled = false; }
}
function preview() {
  const type = $('#adjust-type').value, input = $('#adjust-quantity'), quantity = input.value === '' ? null : Number(input.value);
  input.min = type === 'conteo' ? 0 : 1;
  $('#quantity-label').textContent = { ingreso:'Unidades a ingresar', egreso:'Unidades libres a retirar', conteo:'Total físico contado en depósito' }[type];
  $('#quantity-help').textContent = { ingreso:'Se sumarán al stock disponible.', egreso:'No se pueden retirar unidades reservadas para pedidos.', conteo:'Incluí las piezas reservadas que todavía están en depósito. Este conteo reemplaza la estimación anterior.' }[type];
  const next = quantity === null ? null : type === 'ingreso' ? selected.disponible + quantity : type === 'egreso' ? selected.disponible - quantity : quantity - selected.reservado;
  $('#adjust-preview').textContent = next === null ? '—' : next < 0 ? 'No permitido' : fmt(next);
  $('#save-adjust').disabled = busy || next === null || next < 0 || !input.validity.valid;
}
function openAdjust(product) {
  selected = product; pending = null; $('#adjust-form').reset(); $('#adjust-error').hidden = true;
  $('#adjust-title').textContent = product.nombre;
  $('#adjust-current').textContent = `Físico: ${fmt(product.fisico)} · Reservado: ${fmt(product.reservado)} · Disponible: ${fmt(product.disponible)}`;
  preview(); $('#adjust-dialog').showModal(); $('#adjust-quantity').focus();
}
function openSettings(product) {
  selected = product; const form = $('#settings-form'); $('#settings-error').hidden = true;
  $('#settings-title').textContent = product.nombre;
  for (const key of ['abastecimiento','minimo','notas']) form.elements.namedItem(key).value = product[key];
  $('#settings-dialog').showModal();
}
function lockForm(form, locked) { busy = locked; for (const el of form.elements) el.disabled = locked; }
$('#adjust-form').addEventListener('submit',async event => {
  event.preventDefault(); if (busy) return;
  const form = event.currentTarget, data = new FormData(form);
  const body = { tipo:data.get('tipo'), cantidad:Number(data.get('cantidad')), motivo:data.get('motivo').trim(), disponible_esperado:selected.disponible, reservado_esperado:selected.reservado };
  const signature = JSON.stringify({id:selected.id,...body});
  if (!pending || pending.signature !== signature) pending = {signature,id:crypto.randomUUID()};
  body.idempotencia = pending.id; lockForm(form,true); $('#adjust-error').hidden = true;
  let saved = false;
  try {
    await api('/admin/inventario/' + selected.id + '/ajustes',{method:'POST',body:JSON.stringify(body)});
    saved = true; $('#adjust-dialog').close(); message('Ajuste guardado. El movimiento quedó registrado con tu usuario.');
  } catch(e) {
    if (e.status === 409 && e.message.includes('El stock cambio')) {
      $('#adjust-dialog').close(); message('El stock cambió mientras lo editabas. Revisá las cantidades actualizadas y volvé a abrir el ajuste.',true);
      await refresh().catch(error => message(error.message,true));
    } else { $('#adjust-error').textContent = e.message; $('#adjust-error').hidden = false; message(e.message,true); }
  } finally { lockForm(form,false); }
  if (saved) await refresh().catch(e => message('El ajuste se guardó, pero no pudimos actualizar la vista. Usá Actualizar. ' + e.message,true));
});
$('#settings-form').addEventListener('submit',async event => {
  event.preventDefault(); if (busy) return;
  const form = event.currentTarget, data = new FormData(form); lockForm(form,true); $('#settings-error').hidden = true;
  let saved = false;
  try {
    await api('/admin/inventario/' + selected.id + '/configuracion',{method:'PUT',body:JSON.stringify({abastecimiento:data.get('abastecimiento'),minimo:Number(data.get('minimo')),notas:data.get('notas')})});
    saved = true; $('#settings-dialog').close(); message('Ficha actualizada. Las cantidades no cambiaron.');
  } catch(e) { $('#settings-error').textContent = e.message; $('#settings-error').hidden = false; message(e.message,true); }
  finally { lockForm(form,false); }
  if (saved) await refresh().catch(e => message('La ficha se guardó, pero no pudimos actualizar la vista. ' + e.message,true));
});
for (const el of document.querySelectorAll('[data-close]')) el.addEventListener('click',() => { if (!busy) el.closest('dialog').close(); });
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel',event => { if (busy) event.preventDefault(); });
$('#adjust-type').addEventListener('change',preview); $('#adjust-quantity').addEventListener('input',preview);
$('#search').addEventListener('input',render); $('#filter').addEventListener('change',render);
$('#refresh').addEventListener('click',() => refresh().then(() => message('Inventario actualizado.')).catch(e => message(e.message,true)));
$('#all-history').addEventListener('click',() => loadHistory().catch(e => message(e.message,true)));
$('#logout').addEventListener('click',async () => { try { await api('/auth/logout',{method:'POST',body:'{}'}); location.replace('/tienda#cuenta'); } catch(e) { message(e.message,true); } });
refresh().catch(e => message(e.message,true));
