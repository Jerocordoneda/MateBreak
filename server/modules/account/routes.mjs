const fail = (status,message) => Object.assign(new Error(message),{status});
export async function accountRole(admin,user) {
  if (!user) return null;
  const {data,error} = await admin.rpc('mb_rol',{p_usuario_id:user.id});
  if (error || !['administrador','vendedor','cliente'].includes(data)) throw fail(503,'No pudimos verificar tu cuenta. Reintentá.');
  return data;
}
export function accountRoutes(app,{admin}) {
  const user = req => { if (!req.user) throw fail(401,'Iniciá sesión para continuar'); return req.user.id; };
  const roles = async (req,action,data) => {
    const result=await admin.rpc('mb_admin_roles',{p_actor_id:user(req),p_accion:action,p_datos:data});
    if(result.error) throw fail(result.error.code==='42501'?403:409,['42501','P0001'].includes(result.error.code)?result.error.message:'No se pudo actualizar el equipo');
    return result.data;
  };
  // /api/admin is guarded by inventoryRoutes before these handlers are mounted.
  app.get('/api/admin/dashboard',async(req,res)=>{
    const periodo=typeof req.query.periodo==='string'?req.query.periodo:'mes';
    if(!['mes','30_dias','90_dias','todo'].includes(periodo)) throw fail(400,'Período inválido');
    const result=await admin.rpc('mb_admin_dashboard',{p_actor_id:user(req),p_periodo:periodo});
    if(result.error) throw fail(result.error.code==='42501'?403:503,result.error.code==='42501'?result.error.message:'No pudimos preparar el resumen comercial');
    res.json(result.data);
  });
  app.get('/api/admin/usuarios',async(req,res)=>{
    const page=Number(req.query.pagina??1);
    if(!Number.isInteger(page)||page<1||page>10000) throw fail(400,'Página inválida');
    const {data,error}=await admin.auth.admin.listUsers({page,perPage:50});
    if(error) throw fail(503,'No pudimos consultar las cuentas');
    const assigned=await roles(req,'listar',{ids:data.users.map(u=>u.id)});
    res.json({pagina:page,siguiente:data.users.length===50,usuarios:data.users.map(u=>({id:u.id,email:u.email??'',nombre:typeof u.user_metadata?.nombre==='string'?u.user_metadata.nombre.slice(0,150):'',confirmado:!!u.email_confirmed_at,creado_en:u.created_at,ultimo_acceso:u.last_sign_in_at??null,rol:assigned[u.id]??'cliente'}))});
  });
  app.put('/api/admin/usuarios/:id/rol',async(req,res)=>{
    const b=req.body??{}, valid=['cliente','vendedor','administrador'];
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)||!valid.includes(b.rol)||!valid.includes(b.anterior)) throw fail(400,'Cuenta o rol inválido');
    const {data,error}=await admin.auth.admin.getUserById(req.params.id);
    if(error||!data.user) throw fail(404,'Cuenta no encontrada');
    if(b.rol!=='cliente'&&!data.user.email_confirmed_at) throw fail(409,'La cuenta debe confirmar su email antes de recibir acceso al equipo');
    res.json(await roles(req,'cambiar',{usuario_id:req.params.id,rol:b.rol,anterior:b.anterior}));
  });
  const checked = async query => { const {data,error} = await query; if (error) throw fail(400,error.code==='23505'?'Ese email ya está guardado':'No se pudieron guardar o consultar los emails'); return data; };
  app.get('/api/emails',async (req,res) => res.json(await checked(req.auth.from('email_contacto').select('id,email').eq('usuario_id',user(req)).order('creado_en'))));
  app.post('/api/emails',async (req,res) => {
    const id=user(req), email=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():'';
    if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400,'Indicá un email válido');
    res.status(201).json(await checked(req.auth.from('email_contacto').insert({usuario_id:id,email}).select('id,email').single()));
  });
  app.delete('/api/emails/:id',async (req,res) => {
    const id=user(req);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw fail(400,'Email inválido');
    await checked(req.auth.from('email_contacto').delete().eq('id',req.params.id).eq('usuario_id',id)); res.json({ok:true});
  });
  app.use('/api/ventas',async (req,res,next) => {
    user(req);
    if (await accountRole(admin,req.user) !== 'vendedor') throw fail(403,'Esta operación requiere una cuenta de vendedor');
    next();
  });
  const sales = async (req,action,data={}) => {
    const result=await admin.rpc('mb_ventas',{p_usuario_id:req.user.id,p_accion:action,p_datos:data});
    if (result.error) throw fail(result.error.code==='42501'?403:409,['42501','P0001'].includes(result.error.code)?result.error.message:'No se pudo registrar la operación');
    return result.data;
  };
  app.get('/api/ventas/productos',async (req,res) => res.json(await sales(req,'productos')));
  app.get('/api/ventas',async (req,res) => res.json(await sales(req,'listar')));
  app.post('/api/ventas',async (req,res) => {
    const b=req.body ?? {}, validId=v=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    if (!validId(b.idempotencia) || typeof b.cliente!=='string' || b.cliente.trim().length<2 || b.cliente.length>150 ||
      typeof b.telefono!=='string' || b.telefono.length>40 || typeof b.notas!=='string' || b.notas.length>1000 ||
      !['por_grabar','por_entregar','entregada'].includes(b.estado) || !['efectivo','transferencia','tarjeta','otro'].includes(b.metodo_pago) ||
      !Array.isArray(b.items) || !b.items.length || b.items.length>50) throw fail(400,'Revisá los datos de la venta');
    const items=b.items.map(i => {
      if (!i || typeof i.producto_id!=='string' || !/^[1-9][0-9]{0,18}$/.test(i.producto_id) || !Number.isInteger(i.cantidad) || i.cantidad<1 || i.cantidad>10000 ||
        typeof i.precio_unitario!=='string' || !/^\d{1,7}(\.\d{1,2})?$/.test(i.precio_unitario) || Number(i.precio_unitario)<=0 || Number(i.precio_unitario)>1000000 ||
        typeof i.personalizacion!=='string' || i.personalizacion.length>500) throw fail(400,'Revisá producto, cantidad, precio y grabado');
      return {producto_id:i.producto_id,cantidad:i.cantidad,precio_unitario:i.precio_unitario,personalizacion:i.personalizacion.trim()};
    });
    res.status(201).json(await sales(req,'registrar',{idempotencia:b.idempotencia,cliente:b.cliente.trim(),telefono:b.telefono.trim(),notas:b.notas.trim(),estado:b.estado,metodo_pago:b.metodo_pago,items}));
  });
  app.post('/api/ventas/:id/estado',async (req,res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id) || !['por_entregar','entregada'].includes(req.body?.estado)) throw fail(400,'Venta o estado inválido');
    res.json(await sales(req,'estado',{id:req.params.id,estado:req.body.estado}));
  });
}
