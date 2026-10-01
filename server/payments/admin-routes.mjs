import { accountRole } from '../modules/account/routes.mjs';
const fail = (status, message) => Object.assign(new Error(message), { status });
export function transferAdminRoutes(app, { admin, requireUser, uuid, rpc }) {
  app.post('/api/admin/transferencias/:id/confirmar', async (req, res) => {
    const userId = requireUser(req);
    if (await accountRole(admin, req.user) !== 'administrador') throw fail(403, 'Solo administración puede confirmar transferencias');
    if (!uuid(req.params.id) || typeof req.body?.referencia !== 'string' || !req.body.referencia.trim() || req.body.referencia.length > 150)
      throw fail(400, 'Pedido o referencia inválidos');
    res.json(await rpc('mb_confirmar_transferencia', { p_actor_id: userId, p_pedido_id: req.params.id, p_referencia: req.body.referencia.trim() }));
  });

  app.get('/api/admin/transferencias', async (req, res) => {
    requireUser(req);
    if (await accountRole(admin, req.user) !== 'administrador') throw fail(403, 'Solo administración puede revisar transferencias');
    const { data, error } = await admin.from('pago').select('pedido_id,importe,pedido!inner(id,estado,reserva_hasta,creado_en,usuario_id)')
      .eq('metodo', 'transferencia').eq('estado', 'pendiente').eq('pedido.estado', 'pendiente_pago').order('creado_en', { foreignTable: 'pedido', ascending: false }).limit(100);
    if (error) throw fail(503, 'No se pudieron consultar las transferencias');
    res.json(data.map(row => ({ id: row.pedido_id, importe: row.importe, reserva_hasta: row.pedido.reserva_hasta,
      creado_en: row.pedido.creado_en })));
  });
}
