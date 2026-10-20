const fail = (status, message) => Object.assign(new Error(message), { status });
export function customerRoutes(app, { checked, requireUser, uuid, rpc }) {
  app.get('/api/perfil', async (req, res) => {
    const profile=await checked(req.auth.from('perfil').select('nombre,telefono').eq('id', requireUser(req)).maybeSingle());
    // Auth metadata is used for display only, never permissions.
    res.json(profile??{nombre:typeof req.user.user_metadata?.nombre==='string'?req.user.user_metadata.nombre.slice(0,150):'',telefono:''});
  });
  app.put('/api/perfil', async (req, res) => {
    const id = requireUser(req); const { nombre, telefono } = req.body ?? {};
    if (typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.length > 150 ||
        typeof telefono !== 'string' || telefono.length > 40) throw fail(400, 'Perfil inválido');
    res.json(await checked(req.auth.from('perfil').upsert({ id, nombre: nombre.trim(), telefono: telefono.trim() }).select('nombre,telefono').single()));
  });
  app.get('/api/direcciones', async (req, res) => res.json(await checked(req.auth.from('direccion').select('*').eq('usuario_id', requireUser(req)).order('creado_en'))));
  const address = body => Object.fromEntries(['destinatario','telefono','calle','ciudad','departamento','codigo_postal','pais','indicaciones'].filter(k => typeof body?.[k] === 'string').map(k => [k, body[k]]));
  app.post('/api/direcciones', async (req, res) => res.status(201).json(await checked(req.auth.from('direccion').insert({ ...address(req.body), usuario_id: requireUser(req) }).select().single())));
  app.put('/api/direcciones/:id', async (req, res) => {
    if (!uuid(req.params.id)) throw fail(400, 'Dirección inválida');
    res.json(await checked(req.auth.from('direccion').update(address(req.body)).eq('id', req.params.id).eq('usuario_id', requireUser(req)).select().single()));
  });
  app.delete('/api/direcciones/:id', async (req, res) => {
    if (!uuid(req.params.id)) throw fail(400, 'Dirección inválida');
    await checked(req.auth.from('direccion').delete().eq('id', req.params.id).eq('usuario_id', requireUser(req))); res.json({ ok: true });
  });
  app.get('/api/pedidos', async (req, res) => { requireUser(req); res.json(await rpc(req, 'pedidos')); });
  app.post('/api/pedidos', (req, res) => res.status(410).json({ error: 'Usá el checkout actual para confirmar tu pedido' }));
  app.post('/api/pedidos/:id/cancelar', async (req, res) => {
    requireUser(req); if (!uuid(req.params.id)) throw fail(400, 'Pedido inválido');
    res.json(await rpc(req, 'cancelar', { id: req.params.id }));
  });
}
