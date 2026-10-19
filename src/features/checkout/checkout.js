import {recipientForm} from './recipient-errors.mjs';
import {populateProvinces} from './province-select.mjs';
import { getProducts } from '../../services/products.js';
import {submitLock, leaving} from '../../js/submit-lock.mjs';
import {orderAttemptKey} from './order-attempt.mjs';
import {fetchJson} from '../../services/http.mjs';
import {moveToStep} from './step-focus.mjs';

const $ = selector => document.querySelector(selector);
const money = value => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value || 0));
const direct = new URLSearchParams(location.search).get('directa') === '1';
const suffix = direct ? '?directa=1' : '';
let context, recipient, delivery = 'retiro', shippingQuote = null, payment = '';
let catalogImages = new Map();
let agencies = [];
let agencyRequest = 0;
const recipientFields=recipientForm($('#recipient-form'),{mode:()=>delivery,provinces:()=>context?.provinces,notice:error});
function renderPickup() {
  $('#pickup-selection').hidden = delivery !== 'correo_sucursal' || !context.pickupEnabled;
}
async function loadPickupAgencies() {
  const request = ++agencyRequest;
  shippingQuote = null; agencies = []; $('#pickup-address').textContent = '';
  const select = $('#pickup-agency'); select.replaceChildren(); select.disabled = true;
  const province = $('#pickup-province').value;
  if (!province) return;
  try {
    const loaded = await api('/checkout/sucursales?provincia=' + encodeURIComponent(province));
    if (request !== agencyRequest) return;
    agencies = loaded;
    const placeholder = node('option', 'Elegí una sucursal'); placeholder.value = ''; select.append(placeholder);
    for (const agency of agencies) { const option = node('option', agency.name); option.value = agency.code; select.append(option); }
    select.disabled = !agencies.length;
  } catch (cause) { if (request === agencyRequest) error(cause.message); }
}

function api(path, options = {}) {
  return fetchJson('/api' + path, { credentials: 'same-origin', ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : {} });
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function error(message) { $('#checkout-error').textContent = message; $('#checkout-error').hidden = !message; }
function selectedRecipient() { return recipientFields.read(); }
function renderOrder() {
  const items = $('#order-items'); items.replaceChildren();
  for (const item of context.quote.items || []) {
    const row = node('div', undefined, 'checkout-line');
    const image = catalogImages.get(String(item.producto_id));
    if (image) { const thumbnail = node('img'); thumbnail.src = image; thumbnail.alt = ''; thumbnail.loading = 'lazy'; row.append(thumbnail); }
    const description = node('div', undefined, 'checkout-line-description');
    description.append(node('span', `${item.cantidad} × ${item.nombre}`));
    if (item.opciones && Object.keys(item.opciones).length) description.append(node('small', Object.values(item.opciones).join(', ')));
    if (item.personalizacion) description.append(node('small', item.personalizacion));
    row.append(description, node('strong', money(Number(item.precio_unitario) * Number(item.cantidad))));
    items.append(row);
  }
  const subtotal = Number(context.quote.subtotal);
  $('#merchandise-subtotal').textContent = money(context.quote.subtotal_original_productos??subtotal);
  $('#promotion-discount').textContent=Number(context.quote.descuento_promocional)>0?'− '+money(context.quote.descuento_promocional)+' · '+context.quote.mates_fisicos+' mates físicos':'—';
  const remaining = context.progress.remaining;
  $('#shipping-message').textContent = remaining > 0 ? `Te faltan ${money(remaining)} para tener envío gratis` : '¡Tenés envío gratis!';
  $('#shipping-progress').value = Math.min(80_000, subtotal);
  const discount = payment === 'transferencia' ? Math.round(subtotal * 10) / 100 : 0;
  const shipping = delivery === 'retiro' ? 0 : shippingQuote?.customerShippingCost;
  $('#discount').textContent = discount ? `− ${money(discount)} · 10% transferencia${Number(context.quote.descuento_promocional)>0 ? ' · 28% efectivo en productos' : ''}` : '—';
  $('#shipping-cost').textContent = shipping === undefined ? 'A cotizar' : shipping === 0 ? 'Gratis' : money(shipping);
  $('#order-total').textContent = shipping === undefined ? 'A cotizar' : money(subtotal - discount + shipping);
}
function renderChoices() {
  const deliveries = $('#delivery-options'); deliveries.replaceChildren();
  for (const option of context.deliveries) {
    const label = node('label', undefined, 'checkout-choice'), input = node('input');
    input.type = 'radio'; input.name = 'delivery'; input.value = option.codigo;
    input.disabled = !option.activo || (option.codigo === 'correo_sucursal' && !context.pickupEnabled);
    input.checked = delivery === option.codigo && !input.disabled;
    input.onchange = () => { delivery = option.codigo; shippingQuote = null; recipientFields.sync(); renderPickup(); renderOrder(); };
    label.append(input, node('span', option.nombre + (input.disabled ? ' · Próximamente' : ''))); deliveries.append(label);
  }
  $('#manual-quote').hidden = !context.manualQuoteAvailable;
  $('#shipping-unavailable').hidden = context.modo_prueba || context.deliveries.every(option => option.activo);
  const payments = $('#payment-options'); payments.replaceChildren();
  for (const option of context.payments) {
    const label = node('label', undefined, 'checkout-choice'), input = node('input');
    input.type = 'radio'; input.name = 'payment'; input.value = option.codigo; input.disabled = !option.activo;
    input.onchange = () => { payment = option.codigo; renderOrder(); $('#place-order').disabled = !payment; };
    label.append(input, node('span', option.codigo === 'transferencia' ? 'Transferencia bancaria · 10% adicional sobre productos'
      : context.modo_prueba ? 'Pago de prueba · Mercado Pago simulado' : 'Mercado Pago · tarjetas y medios habilitados'));
    if (input.disabled) label.append(node('small', 'Pendiente de habilitación'));
    payments.append(label);
  }
}
function summaryRow(title, value) {
  const row = node('div', undefined, 'summary-edit-row'), copy = node('div');
  copy.append(node('strong', title), node('p', value));
  const change = node('button', 'Cambiar', 'text-link'); change.type = 'button';
  change.onclick = () => showStep('delivery'); row.append(copy, change); return row;
}
function showStep(step) {
  const pay = step === 'payment';
  $('#delivery-panel').hidden = pay; $('#payment-panel').hidden = !pay;
  $('#step-delivery').setAttribute('aria-current', pay ? 'false' : 'step');
  $('#step-payment').setAttribute('aria-current', pay ? 'step' : 'false');
  if (pay) {
    const summary = $('#editable-summary'); summary.replaceChildren(
      summaryRow('Contacto', recipient.email),
      summaryRow('Destinatario', `${recipient.nombre} ${recipient.apellido} · ${recipient.telefono}`),
      ...(delivery==='correo_domicilio'?[summaryRow('Dirección', `${recipient.calle} ${recipient.numero}, ${recipient.codigo_postal} · ${recipient.ciudad}, ${recipient.provincia}`)]:[]),
      summaryRow('Entrega', context.deliveries.find(option => option.codigo === delivery)?.nombre || delivery),
    );
    if (delivery === 'correo_sucursal') {
      const agency = agencies.find(a => a.code === $('#pickup-agency').value);
      summary.append(summaryRow('Sucursal de prueba', `${agency?.name || ''} · ${agency?.address?.postalCode || ''}`));
    }
  }
  error('');
  moveToStep(step, { heading: $(pay ? '#payment-panel h2' : '#delivery-panel h2'), status: $('#checkout-step-status'), view: window });
}
async function prepareDelivery(event) {
  event.preventDefault(); error('');
  try {
    recipient = selectedRecipient();
    const chosen = context.deliveries.find(option => option.codigo === delivery && option.activo);
    if (!chosen) throw Error('Elegí una modalidad de entrega disponible');
    if (delivery !== 'retiro') {
      const pickup = delivery === 'correo_sucursal' ? {provincia_codigo:$('#pickup-province').value,punto_codigo:$('#pickup-agency').value} : {};
      if (delivery === 'correo_sucursal' && !pickup.punto_codigo) throw Error('Elegí una sucursal');
      const quotes = await api('/checkout/cotizar-envio', { method: 'POST', body: JSON.stringify({ destinatario: recipient, modalidad: delivery, directa: direct, ...pickup }) });
      if (quotes.status === 'manual_quote_required') { $('#manual-quote').hidden = false; error(quotes.message); return; }
      shippingQuote = quotes[0];
      if (!shippingQuote) throw Error('No se pudo cotizar el envío');
    }
    renderOrder(); showStep('payment');
  } catch (cause) { if(cause.fields){showStep('delivery');recipientFields.show(cause.fields);}else error(cause.message); }
}
function attemptStorage() { try { return sessionStorage; } catch { return null; } }
const placeOrder = submitLock(async () => {
  error('');
  try {
    const choices = { destinatario: recipient, envio: delivery, pago: payment, cotizacion_id: shippingQuote?.id || null, directa: direct };
    const idempotencia = await orderAttemptKey(attemptStorage(), context.cart.id, choices);
    const result = await api('/checkout/pedidos', { method: 'POST', body: JSON.stringify({ idempotencia, ...choices }) });
    location.assign(result.redirectUrl || `/checkout/resultado?pedido=${encodeURIComponent(result.order.id)}`);
    return leaving;
  } catch (cause) { if(cause.fields){showStep('delivery');recipientFields.show(cause.fields);}else error(cause.message); }
}, { lock: () => { $('#place-order').disabled = true; }, release: () => { $('#place-order').disabled = !payment; } });
async function init() {
  try {
    context = await api('/checkout/contexto' + suffix);
    populateProvinces(context.provinces,$('#recipient-form [name=provincia]'),$('#pickup-province'));
    $('#test-mode').hidden = !(context.modo_prueba||context.mercadopago_test);
    if(context.mercadopago_test){$('#test-mode').textContent='Staging · Mercado Pago TEST con Checkout Pro. Envío simulado; sin despacho real.';$('#payment-help').textContent='Utilizá exclusivamente el comprador y los medios de pago de prueba de Mercado Pago.';}
    if(context.modo_prueba)$('#test-mode').textContent=context.mock_persistente
      ? 'Prueba de Staging · pago y envío simulados, sin cobros ni despachos reales. El pedido se guarda y reserva inventario de prueba.'
      : 'Prueba sin persistencia · sin cobros, despachos ni reservas de inventario. Se borra al reiniciar el servidor.';
    if (context.modo_prueba) $('#payment-help').textContent = 'Este pago es simulado. No se solicita tarjeta ni se realiza un cobro.';
    if (!context.cart.items?.length) { error('Tu selección está vacía. Volvé al catálogo para elegir un producto.'); return; }
    if (context.cart.requiere_confirmacion_catalogo) { error('Un producto ya no está disponible para comprar. Revisá tu carrito.'); return; }
    try { catalogImages = new Map((await getProducts()).map(product => [String(product.id_producto), product.imagen_principal])); }
    catch { /* Images are decorative; the confirmed order is still available. */ }
    if(context.requiresAuthentication)throw Error('El checkout actualizado todavía no está disponible. Tu carrito sigue guardado.');
    if (context.user) {
      $('#recipient-form [name=email]').value = context.user.email || '';
      try {
        const profile = await api('/perfil');
        const words = (profile.nombre || '').trim().split(/\s+/);
        if (words.length > 1) { $('#recipient-form [name=nombre]').value = words.shift(); $('#recipient-form [name=apellido]').value = words.join(' '); }
        $('#recipient-form [name=telefono]').value = profile.telefono || '';
      } catch { /* Profile prefill is optional. */ }
    }
    const firstActive = context.deliveries.find(option => option.activo && option.codigo !== 'correo_sucursal');
    delivery = firstActive?.codigo || '';
    renderChoices(); recipientFields.sync(); renderOrder();
  } catch (cause) {
    if(cause.fields){showStep('delivery');recipientFields.show(cause.fields);}else error(cause.message);
    // A cold Render start answers 502 before anything loads: offer the retry here.
    $('#checkout-retry').hidden = !cause.retryable;
  }
}
$('#recipient-form').addEventListener('submit', prepareDelivery);
$('#pickup-province').addEventListener('change', loadPickupAgencies);
$('#pickup-agency').addEventListener('change', () => {
  shippingQuote = null;
  const agency = agencies.find(a => a.code === $('#pickup-agency').value);
  $('#pickup-address').textContent = agency ? [agency.address?.streetName,agency.address?.streetNumber,agency.address?.city,agency.address?.postalCode].filter(Boolean).join(' ') : '';
});

$('#place-order').addEventListener('click', () => { if (payment) placeOrder(); });
$('#checkout-retry').addEventListener('click', () => { $('#checkout-retry').hidden = true; error(''); init(); });
// Coming back from Mercado Pago restores a page locked mid-navigation; reload the cart state.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
init();

$('#download-manual-quote').addEventListener('click', async () => {
 try {
  const request = await api('/checkout/cotizacion-manual',{method:'POST',body:JSON.stringify({destinatario:selectedRecipient(),modalidad:delivery,directa:direct})});
  const url=URL.createObjectURL(new Blob([JSON.stringify(request,null,2)],{type:'application/json'}));
  const link=node('a');link.href=url;link.download='matebreak-cotizacion-manual.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  error(request.message);
 } catch (cause) { if(cause.fields){showStep('delivery');recipientFields.show(cause.fields);}else error(cause.message); }
});
