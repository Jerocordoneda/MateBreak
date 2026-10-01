const orderId = new URLSearchParams(location.search).get('pedido');
const $ = selector => document.querySelector(selector);
const titles = { pendiente_pago: 'Pedido pendiente de pago', pagado: 'Pago confirmado', en_preparacion: 'Estamos preparando tu pedido', enviado: 'Tu pedido está en camino', entregado: 'Pedido entregado', cancelado: 'Pedido cancelado', expirado: 'La reserva venció' };
if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(orderId || '')) {
  $('#result-title').textContent = 'Pedido inválido';
} else {
  try {
    const response = await fetch(`/api/checkout/pedidos/${encodeURIComponent(orderId)}`, { credentials: 'same-origin' });
    const order = await response.json();
    if (!response.ok) throw Error(order.error || 'No pudimos consultar el pedido');
    $('#result-test-mode').hidden = !order.mock;
    $('#result-title').textContent = order.mock
      ? ({ pagado:'Compra de prueba aprobada', cancelado:'Pago de prueba rechazado', pendiente_pago:'Pago de prueba pendiente', expirado:'Prueba vencida' }[order.estado] || 'Estado de prueba')
      : order.estado === 'cancelado' && order.estado_pago_externo === 'rejected'
        ? 'Pago rechazado' : titles[order.estado] || 'Estado de tu pedido';
    const amount = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(order.total);
    $('#result-description').textContent = order.mock
      ? `Prueba ${order.id.slice(0,8).toUpperCase()} · ${amount} · ${order.paymentId}. No se realizó ningún cobro ni se reservó stock. Esta prueba desaparece al reiniciar el servidor.`
      : `Pedido ${order.id.slice(0,8).toUpperCase()} · ${amount}. ${order.estado === 'pendiente_pago' ? 'Esperamos la confirmación del pago antes de preparar el envío.' : 'Consultá el detalle en Mi cuenta.'}`;
    if (order.mock) { $('#result-next').href = '/tienda'; $('#result-next').textContent = 'Volver al catálogo'; }
    if (order.estado === 'pendiente_pago' && order.instructions) {
      $('#transfer-details').hidden = false;
      $('#transfer-message').textContent = `${order.instructions.message} Vence: ${new Date(order.reserva_hasta).toLocaleString('es-AR')}.`;
      for (const field of ['cbu','alias','holder']) $(`#transfer-${field}`).textContent = order.instructions[field];
      $('#copy-cbu').onclick = () => navigator.clipboard.writeText(order.instructions.cbu);
      $('#copy-alias').onclick = () => navigator.clipboard.writeText(order.instructions.alias);
    }
  } catch (cause) { $('#result-title').textContent = 'No pudimos verificar el pedido'; $('#result-description').textContent = cause.message; }
}
