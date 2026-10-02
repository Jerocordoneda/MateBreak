export function simulationKind(order) {
  // Compatibility with persisted orders returned before the additive metadata.
  const payments=order.pagos || order.pago || [];
  const persisted = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(order.id || '') && Array.isArray(payments) && payments.some(p =>
    p.metodo === 'mercadopago' && p.referencia_externa === `TEST-LOCAL-${order.id}`);
  if(order.simulacion === 'persistente' || persisted)return 'persistente';
  return order.mock === true ? 'volatil' : null;
}
export function deliveryText(address = {}) {
  if(typeof address.retiro === 'string')return address.retiro;
  const nested=address.destinatario && typeof address.destinatario === 'object' && !Array.isArray(address.destinatario);
  const d=nested ? address.destinatario : address;
  const name=nested ? [d.nombre,d.apellido].filter(v=>typeof v==='string').join(' ') : d.destinatario;
  const street=nested ? [d.calle,d.numero].filter(v=>typeof v==='string').join(' ') : d.calle;
  // No email, phone or reference notes in the order summary.
  return [name,street,d.ciudad,d.provincia || d.departamento,d.codigo_postal,d.pais]
    .filter(v=>typeof v==='string' && v.trim()).join(' · ') || 'A coordinar';
}
