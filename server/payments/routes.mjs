const fail = (status, message) => Object.assign(new Error(message), { status });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function paymentRoutes(app, { admin, mercadoPago }) {
  app.post('/api/pagos/mercadopago/webhook', async (req, res) => {
    if (!mercadoPago.ready) throw fail(503, 'Mercado Pago no está habilitado');
    const paymentId = req.query['data.id'];
    if (req.query.type !== 'payment' || !/^\d{1,30}$/.test(String(paymentId || ''))) return res.sendStatus(200);
    if (!mercadoPago.verifyWebhook({ signature: req.headers['x-signature'], requestId: req.headers['x-request-id'], dataId: paymentId }))
      throw fail(401, 'Firma de Mercado Pago inválida');

    // A signed notification is still only a hint: payment state comes from
    // Mercado Pago's authenticated API, never the URL or browser return.
    const payment = await mercadoPago.getPayment(paymentId);
    if (String(payment.id) !== String(paymentId)) throw fail(409, 'Pago externo inconsistente');
    const orderId = payment.external_reference;
    if (!uuid(orderId)) throw fail(409, 'Referencia externa inválida');
    const { data: order, error: orderError } = await admin.from('pedido').select('id,usuario_id,total,moneda,estado,reserva_hasta,pago(id,metodo,estado)').eq('id', orderId).maybeSingle();
    if (orderError) throw fail(503, 'No se pudo verificar el pedido');
    if (!order) throw fail(404, 'Pedido inexistente');
    const internalPayment = order.pago?.find?.(entry => entry.metodo === 'mercadopago');
    const amountMatches = Number(payment.transaction_amount) === Number(order.total) && payment.currency_id === 'ARS';
    let outcome = 'pendiente';
    if (!internalPayment || !amountMatches) {
      outcome = 'revision_manual';
    } else if (payment.status === 'approved') {
      const result = await admin.rpc('mb_confirmar_pago', {
        p_pago_id: internalPayment.id, p_referencia: String(payment.id), p_importe: Number(payment.transaction_amount), p_moneda: 'ARS',
      });
      outcome = result.error ? 'revision_manual' : 'aplicado';
    } else if (['rejected','cancelled'].includes(payment.status)) {
      if (order.estado === 'pendiente_pago') {
        const result = await admin.rpc('mb_comercio', { p_token_hash: '0'.repeat(64), p_usuario_id: order.usuario_id,
          p_accion: 'cancelar', p_datos: { id: order.id } });
        outcome = result.error ? 'revision_manual' : 'aplicado';
      } else outcome = 'ignorado';
    }
    const { error: auditError } = await admin.from('pago_webhook_auditoria').upsert({
      pago_externo_id: String(payment.id), estado_externo: String(payment.status), pedido_id: order.id, resultado: outcome,
    }, { onConflict: 'pago_externo_id,estado_externo' });
    if (auditError) throw fail(503, 'No se pudo auditar la notificación');
    res.sendStatus(200);
  });
}
