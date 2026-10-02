import {money as formatMoney} from '../../services/products.js';
const $ = selector => document.querySelector(selector);
const money = value => formatMoney(value,cart.moneda||'ARS');
const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
let cart = { items: [], total: 0 }, addresses = [], methods = { pagos: [], envios: [] };
let signedIn = false, loaded = false, cartBusy = false, toastTimer;
const statuses = { pendiente_pago: 'Pendiente de pago', pagado: 'Pago confirmado', en_preparacion: 'En preparación', enviado: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado', expirado: 'Reserva vencida', pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado', reembolsado: 'Reembolsado', preparando: 'En preparación' };

function icon(type = 'bag') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const paths = {
    bag: 'M5 7h14l1 14H4L5 7z M9 8V6a3 3 0 016 0v2',
    mate: 'M7 8h10l2 7a7 7 0 01-14 0l2-7z M8 8h8 M13 8l4-6 M8 18c1 1 2 1 3 1',
    combo: 'M3 7l9-4 9 4-9 4-9-4z M3 7v10l9 4 9-4V7 M12 11v10 M7 5l10 4',
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', paths[type] || paths.bag); svg.append(path); return svg;
}
function message(text, error = false) {
  clearTimeout(toastTimer); $('#mensaje').textContent = text; $('#mensaje').classList.toggle('error', error);
  if (!error) toastTimer = setTimeout(() => { $('#mensaje').textContent = ''; }, 6500);
}
function showPage(focus = false) {
  if (location.hash === '#cuenta') { location.replace('/mi-cuenta'); return; }
  if (location.hash === '#catalogo') { location.replace('/tienda'); return; }
  const pages = ['carrito', 'cuenta', 'pedidos'];
  if (location.hash === '#contenido') return;
  const name = pages.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'carrito';
  for (const page of pages) $('#' + page).hidden = page !== name;
  for (const link of document.querySelectorAll('[data-nav]')) {
    if (link.dataset.nav === name) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  document.title = ({ carrito: 'Tu carrito', catalogo: 'Catálogo', cuenta: 'Mi cuenta', pedidos: 'Mis pedidos' })[name] + ' · MateBreak';
  if (focus) { const title = $('#' + name + ' h1'); title.tabIndex = -1; title.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); }
}
window.addEventListener('hashchange', () => showPage(true));
showPage();
// These hashes are page tabs, not scroll anchors. Keep the brand visible on arrival.
window.addEventListener('load',()=>{if(['#carrito','#pedidos'].includes(location.hash))window.scrollTo({top:0,behavior:'instant'});},{once:true});

async function api(url, method = 'GET', data) {
  const response = await fetch('/api' + url, { method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  let result; try { result = await response.json(); } catch { throw Error('No pudimos conectar con la tienda. Intentá nuevamente.'); }
  if (!response.ok) throw Error(result.error || 'No se pudo completar la operación.'); return result;
}
function action(label, callback, className = 'button-secondary') {
  const button = el('button', label, className); button.type = 'button';
  button.onclick = async () => { button.disabled = true; try { await callback(); } catch (error) { message(error.message, true); } finally { button.disabled = false; } };
  return button;
}
function emptyState(title, description, linkText, href) {
  const box = el('div', undefined, 'empty-cart'), symbol = el('div', undefined, 'empty-icon'); symbol.append(icon());
  box.append(symbol, el('h3', title), el('p', description));
  if (href) { const link = el('a', linkText + '  →', 'button-primary'); link.href = href; box.append(link); }
  return box;
}
function updateSummary() {
  const count = cart.items.reduce((sum, item) => sum + item.cantidad, 0);
  window.dispatchEvent(new CustomEvent('mb:cart',{detail:count}));
  const badge=$('#cart-count');if(badge)badge.textContent=count;
  $('#selection-count').textContent = `${count} ${count === 1 ? 'producto' : 'productos'}`; $('#summary-count').textContent = `(${count})`;
  const quote = cart.cotizacion;
  $('#subtotal').textContent = money(quote?.subtotal_original ?? cart.total);
  $('#total').textContent = money(quote?.subtotal ?? cart.total);
  $('#promotion-row').hidden = !quote?.descuento_promocional;
  $('#promotion-discount').textContent = quote?.descuento_promocional ? `− ${money(quote.descuento_promocional)}` : '—';
  $('#subtotal-label').textContent = quote ? 'Mercadería cotizada' : 'Subtotal estimado';
  $('#shipping-progress').max = quote?.progress.threshold ?? 1;
  $('#shipping-progress').value = quote ? Math.min(quote.progress.threshold, Number(quote.subtotal)) : 0;
  $('#shipping-message').textContent = quote ? (quote.progress.eligible ? '¡Tenés envío gratis!' : `Te faltan ${money(quote.progress.remaining)} para tener envío gratis`) : 'El envío se confirma en el checkout.';
  const invalidItems = cart.items.some(i => i.activo === false);
  $('#checkout-button').disabled = !loaded || !count || invalidItems || cartBusy || cart.requiere_confirmacion_catalogo || Boolean(cart.error_cotizacion);
  $('#checkout-notice').textContent = !loaded ? 'Cargando tu selección…' : !count ? 'Agregá un producto para empezar.' : invalidItems ? 'Quitá los productos no disponibles para continuar.' : 'El precio y la disponibilidad se confirman en el checkout.';
  if(cart.requiere_confirmacion_catalogo)$('#checkout-notice').textContent='Tu selección está guardada. Una variante requiere confirmar su relación con el inventario o su stock.';
  if(cart.error_cotizacion)$('#checkout-notice').textContent=cart.error_cotizacion;
  else if(quote && count)$('#checkout-notice').textContent=quote.descuento_promocional ? 'Promoción incluida. El envío y el total final se confirman en el checkout.' : 'Precio cotizado. El envío y el total final se confirman en el checkout.';
}
function renderCart() {
  $('#items').replaceChildren(); $('#items').setAttribute('aria-busy', String(cartBusy));
  if (!cart.items.length) $('#items').append(emptyState('A tu carrito le falta un buen mate.', 'Elegí ese compañero de todos los días. Nosotros te guardamos el lugar.', 'Explorar el catálogo', '/tienda'));
  for (const item of [...cart.items].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))) {
    const quoted = cart.cotizacion?.items.find(line => item.variante_id ? String(line.variante_id) === String(item.variante_id) : line.variante_id == null && String(line.producto_id) === String(item.producto_id));
    const row = el('article', undefined, 'cart-item' + (item.activo === false ? ' unavailable' : ''));
    const symbol = el('div', undefined, 'product-symbol'); symbol.append(icon('mate'));
    const detail = el('div'); detail.append(el('h3', item.nombre));
    if(quoted && quoted.precio_original > quoted.precio_unitario)detail.append(el('del', `${money(quoted.precio_original)} precio original por unidad`, 'unit-price'));
    detail.append(el('p', `${money(quoted?.precio_unitario ?? item.precio)} por unidad${quoted && quoted.precio_original > quoted.precio_unitario ? ' · Promoción aplicada' : ''}`, 'unit-price'));
    if(item.opciones)detail.append(el('p',Object.values(item.opciones).join(' · '),'unit-price'));
    if(item.personalizacion)detail.append(el('p',item.personalizacion,'unit-price'));
    if (item.activo === false) detail.append(el('p', 'Este producto ya no está disponible.', 'stock-warning'));
    const bottom = el('div', undefined, 'item-bottom'), stepper = el('div', undefined, 'quantity-control');
    stepper.setAttribute('role', 'group'); stepper.setAttribute('aria-label', `Cantidad de ${item.nombre}`);
    const itemKey=item.variante_id?'v-'+item.variante_id:item.producto_id;
    const minus = action('−', () => changeQuantity(itemKey, item.cantidad - 1), 'quantity-minus');
    const plus = action('+', () => changeQuantity(itemKey, item.cantidad + 1), 'quantity-plus');
    minus.setAttribute('aria-label', `Reducir cantidad de ${item.nombre}`); plus.setAttribute('aria-label', `Aumentar cantidad de ${item.nombre}`);
    minus.disabled = item.cantidad <= 1 || cartBusy; plus.disabled = item.cantidad >= 99 || cartBusy || item.activo === false;
    for (const button of [minus, plus]) { button.dataset.cartAction = ''; button.dataset.product = itemKey; }
    stepper.append(minus, el('output', item.cantidad), plus);
    const remove = action('Quitar', () => changeQuantity(itemKey, 0), 'remove-item'); remove.dataset.cartAction = ''; remove.setAttribute('aria-label', `Quitar ${item.nombre}`);
    bottom.append(stepper, remove); detail.append(bottom);
    row.append(symbol, detail, el('strong', money(quoted?.subtotal ?? item.subtotal), 'item-total')); $('#items').append(row);
  }
  updateSummary();
}
async function changeQuantity(productId, quantity) {
  if (cartBusy) return;
  const focused = document.activeElement;
  const focusClass = focused?.className;
  cartBusy = true; $('#items').setAttribute('aria-busy', 'true'); updateSummary();
  document.querySelectorAll('[data-cart-action]').forEach(b => { b.disabled = true; });
  let succeeded = false;
  try { cart = await api(productId.startsWith('v-')?`/carrito/variantes/${productId.slice(2)}`:`/carrito/items/${productId}`, 'PUT', { cantidad: quantity }); succeeded = true; }
  finally {
    cartBusy = false; renderCart();
    // Restore keyboard focus after replacing rows, without scrolling the page.
    const controls = [...document.querySelectorAll('[data-product]')];
    const replacement = controls.find(b => b.dataset.product === productId && b.className === focusClass && !b.disabled)
      || controls.find(b => b.dataset.product === productId && !b.disabled)
      || (quantity === 0 ? $('#items button:not(:disabled), #items a') : null);
    if (replacement) replacement.focus({ preventScroll: true });
  }
  if (succeeded) message(quantity === 0 ? 'Producto quitado del carrito.' : 'Tu carrito está actualizado.');
}
async function renderPrivate() {
  const { usuario } = await api('/sesion'); signedIn = !!usuario;
  $('#usuario').textContent = usuario ? usuario.email : 'Ingresá para guardar tus direcciones y seguir tus pedidos.';
  $('#privado').hidden = !usuario; $('#logout').hidden = !usuario; $('#login').hidden = !!usuario;
  updateSummary();
  if (!usuario) {
    addresses = [];
    $('#lista-pedidos').replaceChildren(emptyState('Cada pausa tiene su historia.', 'Ingresá a tu cuenta para ver el estado y el detalle de tus pedidos.', 'Ingresar a mi cuenta', '#cuenta')); return;
  }
  const [profile, dirs, orders] = await Promise.all([api('/perfil'), api('/direcciones'), api('/pedidos')]); addresses = dirs;
  for (const name of ['nombre', 'telefono']) $(`#perfil [name=${name}]`).value = profile?.[name] || '';
  $('#direcciones').replaceChildren();
  if (!dirs.length) $('#direcciones').append(el('p', 'Todavía no guardaste una dirección. Agregala en el formulario de abajo.', 'muted'));
  for (const dir of addresses) {
    const row = el('article', undefined, 'address-row'); row.append(el('strong', dir.destinatario), el('p', `${dir.calle}, ${dir.ciudad} · ${dir.departamento}`));
    row.append(action('Editar', () => { for (const field of $('#direccion').elements) if (field.name) field.value = dir[field.name] ?? ''; $('#address-details').open = true; $('#direccion input[name=destinatario]').focus(); }), action('Eliminar', async () => { await api(`/direcciones/${dir.id}`, 'DELETE', {}); await renderPrivate(); message('Dirección eliminada.'); })); $('#direcciones').append(row);
  }
  $('#lista-pedidos').replaceChildren();
  if (!orders.length) $('#lista-pedidos').append(emptyState('Tu primera pausa te espera.', 'Cuando hagas una compra, vas a poder seguirla desde acá.', 'Explorar el catálogo', '/tienda'));
  for (const order of orders) {
    const row = el('article', undefined, 'order-card'), heading = el('div', undefined, 'order-heading');
    heading.append(el('h3', `Pedido ${order.id.slice(0, 8).toUpperCase()}`), el('span', statuses[order.estado] || order.estado, 'order-status'));
    row.append(heading, el('p', `${new Date(order.creado_en).toLocaleDateString('es-AR')} · ${money(order.total)}`));
    for (const item of order.items || []) row.append(el('p', `${item.cantidad} × ${item.nombre} · ${money(item.subtotal)}`));
    for (const pago of order.pagos || []) row.append(el('p', `Pago: ${methods.pagos.find(p => p.codigo === pago.metodo)?.nombre || pago.metodo} · ${statuses[pago.estado] || pago.estado}`));
    if (order.envio) row.append(el('p', `Entrega: ${statuses[order.envio.estado] || order.envio.estado}${order.envio.seguimiento ? ' · Seguimiento: ' + order.envio.seguimiento : ''}`));
    if (order.estado === 'pendiente_pago') row.append(action('Cancelar pedido', async () => { await api(`/pedidos/${order.id}/cancelar`, 'POST', {}); await renderPrivate(); message('Pedido cancelado.'); }));
    $('#lista-pedidos').append(row);
  }
}
function form(selector, callback) {
  $(selector).onsubmit = async event => {
    event.preventDefault(); const buttons = [...event.target.querySelectorAll('button')];
    if (event.target.dataset.submitting) return;
    event.target.dataset.submitting = 'true'; buttons.forEach(b => { b.disabled = true; });
    try { await callback(Object.fromEntries(new FormData(event.target)), event); }
    catch (error) { message(error.message, true); }
    finally { delete event.target.dataset.submitting; buttons.forEach(b => { b.disabled = false; }); updateSummary(); }
  };
}
form('#login', async (data, event) => {
  const route = event.submitter?.value || 'login';
  const result = await api('/auth/' + route, 'POST', data); $('#login [name=password]').value = '';
  message(result.mensaje || 'Qué bueno tenerte de vuelta.'); await renderPrivate(); cart = await api('/carrito'); renderCart();
  if (route === 'login') location.assign('/mi-cuenta');
});
$('#logout').onclick = async () => { $('#logout').disabled = true; try { await api('/auth/logout', 'POST', {}); await renderPrivate(); cart = await api('/carrito'); renderCart(); message('Cerraste tu sesión.'); } catch (error) { message(error.message, true); } finally { $('#logout').disabled = false; } };
form('#perfil', async data => { await api('/perfil', 'PUT', data); message('Tus datos están guardados.'); });
form('#direccion', async data => {
  const { id, ...fields } = data; const saved = await api('/direcciones' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', fields);
  $('#direccion').reset(); await renderPrivate(); updateSummary(); message('Dirección guardada. Ya podés seleccionarla para tu pedido.');
});
$('#checkout-button').onclick=()=>{if(!$('#checkout-button').disabled)location.assign('/checkout');};
async function init() {
  try {
    const [initialCart, available] = await Promise.all([api('/carrito'), api('/metodos')]);
    cart = initialCart; methods = available; loaded = true; renderCart();
    await renderPrivate();
  } catch (error) {
    $('#items').setAttribute('aria-busy', 'false');
    if (!loaded) {
      const state = emptyState('No pudimos cargar tu carrito.', 'Tu selección sigue guardada. Probá nuevamente en unos segundos.'); state.append(action('Reintentar', init, 'button-primary')); $('#items').replaceChildren(state);
    }
    message(error.message, true);
  }
}
init();
