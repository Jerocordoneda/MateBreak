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
    const page=Number(req.query?.pagina??1);
    if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Página inválida');
    const { data, error } = await admin.from('pago').select('pedido_id,importe,pedido!inner(id,numero_publico,estado,reserva_hasta,creado_en,direccion_entrega)')
      .eq('metodo', 'transferencia').eq('estado', 'pendiente').eq('pedido.estado', 'pendiente_pago').order('creado_en', { foreignTable: 'pedido', ascending: false }).range((page-1)*100,page*100-1);
    if (error) throw fail(503, 'No se pudieron consultar las transferencias');
    res.json(data.map(row => ({ id: row.pedido_id, importe: row.importe, reserva_hasta: row.pedido.reserva_hasta,
      creado_en: row.pedido.creado_en, numero:row.pedido.numero_publico, metodo:'transferencia', estado:'pendiente_pago',
      cliente:[row.pedido.direccion_entrega?.destinatario?.nombre,row.pedido.direccion_entrega?.destinatario?.apellido].filter(Boolean).join(' '),
      contacto:row.pedido.direccion_entrega?.destinatario?.telefono||row.pedido.direccion_entrega?.destinatario?.email||'',
      segundos_restantes:Math.max(0,Math.ceil((Date.parse(row.pedido.reserva_hasta)-Date.now())/1000)) })));
  });
}
