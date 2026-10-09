import path from 'node:path';
import { fileURLToPath } from 'node:url';

const files = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../private-ui');
const fail = (status, message) => Object.assign(new Error(message), { status });
const integer = value => Number.isInteger(value) && value >= 0 && value <= 1000000;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function inventoryRoutes(app, { admin, authFactory, verifyLiveSession }) {
  const protect = async (req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    // API identity is already verified by getUser(). HTML/assets require the
    // same verification; neither a hidden URL nor user_metadata is authority.
    if (!req.auth) {
      req.auth = authFactory(req, res);
      const { data, error } = await req.auth.auth.getUser();
      req.user = error ? null : data?.user;
    }
    if (!req.user) {
      if (req.path === '/interno/inventario') return res.redirect('/mi-cuenta');
      throw fail(401, 'Iniciá sesión para continuar');
    }
    await verifyLiveSession(req,admin);
    const { data, error } = await admin.rpc('mb_inventario_autorizado', { p_usuario_id: req.user.id });
    if (error) throw fail(503, 'No se pudo verificar el acceso. Reintentá.');
    if (data !== true) throw fail(403, 'Acceso exclusivo del equipo de inventario');
    next();
  };
  const rpc = async (req, action, data = {}) => {
    const result = await admin.rpc('mb_inventario', { p_usuario_id: req.user.id, p_accion: action, p_datos: data });
    if (result.error) throw fail(result.error.code === '42501' ? 403 : 409, ['P0001', '42501'].includes(result.error.code) ? result.error.message : 'No se pudo completar la operación de inventario');
    return result.data;
  };
  app.use('/api/admin', protect);
  app.get('/api/admin/inventario', async (req, res) => res.json(await rpc(req, 'listar')));
  app.get('/api/admin/inventario/historial', async (req, res) => {
    const id = req.query.producto_id;
    if (id !== undefined && (typeof id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(id))) throw fail(400, 'Artículo inválido');
    res.json(await rpc(req, 'historial', id ? { producto_id: id } : {}));
  });
  app.post('/api/admin/inventario/:id/ajustes', async (req, res) => {
    const { tipo, cantidad, motivo, idempotencia, disponible_esperado, reservado_esperado } = req.body ?? {};
    if (!/^[1-9][0-9]{0,18}$/.test(req.params.id) || !['ingreso','egreso','conteo'].includes(tipo) || !integer(cantidad) ||
      (tipo !== 'conteo' && cantidad === 0) || typeof motivo !== 'string' || motivo.trim().length < 3 || motivo.trim().length > 500 ||
      !uuid(idempotencia) || !Number.isInteger(disponible_esperado) || disponible_esperado < 0 || !Number.isInteger(reservado_esperado) || reservado_esperado < 0) throw fail(400, 'Revisá el tipo, la cantidad y el motivo del ajuste');
    res.json(await rpc(req, 'ajustar', { producto_id: req.params.id, tipo, cantidad, motivo: motivo.trim(), idempotencia, disponible_esperado, reservado_esperado }));
  });
  app.get('/api/admin/inventario/recepciones', async (req, res) => {
    const id=req.query.producto_id;
    if(id!==undefined&&(typeof id!=='string'||!/^[1-9][0-9]{0,18}$/.test(id)))throw fail(400,'Artículo inválido');
    const result=await admin.rpc('mb_listar_recepciones',{p_actor_id:req.user.id,p_producto_id:id||null});
    if(result.error)throw fail(503,'No se pudo consultar el historial de recepciones');
    res.json(result.data);
  });
  app.post('/api/admin/inventario/:id/recepciones', async (req, res) => {
    const {cantidad,costo_unitario,fecha,proveedor,motivo,idempotencia,disponible_esperado,reservado_esperado}=req.body??{};
    if(!/^[1-9][0-9]{0,18}$/.test(req.params.id)||!integer(cantidad)||cantidad===0
      ||typeof costo_unitario!=='string'||!/^\d{1,9}(?:\.\d{1,2})?$/.test(costo_unitario)
      ||typeof fecha!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ||typeof proveedor!=='string'||proveedor.length>150
      ||typeof motivo!=='string'||motivo.trim().length<3||motivo.trim().length>500
      ||!uuid(idempotencia)||!Number.isInteger(disponible_esperado)||disponible_esperado<0
      ||!Number.isInteger(reservado_esperado)||reservado_esperado<0)throw fail(400,'Revisá la cantidad, el costo ARS, la fecha y el motivo');
    const result=await admin.rpc('mb_registrar_recepcion',{p_actor_id:req.user.id,p_datos:{
      producto_id:req.params.id,cantidad,costo_unitario,fecha,proveedor:proveedor.trim(),motivo:motivo.trim(),
      idempotencia,disponible_esperado,reservado_esperado,
    }});
    if(result.error)throw fail(result.error.code==='42501'?403:409,['P0001','42501'].includes(result.error.code)?result.error.message:'No se pudo registrar la recepción');
    res.json(result.data);
  });
  app.get('/api/admin/preparacion',async(req,res)=>{
    const result=await admin.rpc('mb_preparacion',{p_actor_id:req.user.id,p_accion:'listar',p_datos:{}});
    if(result.error)throw fail(503,'No se pudo consultar la preparación');res.json(result.data);
  });
  app.post('/api/admin/preparacion/:id/estado',async(req,res)=>{
    const {estado,nota}=req.body??{};
    if(!uuid(req.params.id)||!['enviado_grabar','grabado_recibido','listo_despachar'].includes(estado)
      ||typeof nota!=='string'||nota.length>500)throw fail(400,'Estado de preparación inválido');
    const result=await admin.rpc('mb_preparacion',{p_actor_id:req.user.id,p_accion:'avanzar',p_datos:{id:req.params.id,estado,nota}});
    if(result.error)throw fail(result.error.code==='42501'?403:409,['P0001','42501'].includes(result.error.code)?result.error.message:'No se pudo actualizar la preparación');
    res.json(result.data);
  });
  app.put('/api/admin/inventario/:id/configuracion', async (req, res) => {
    const { abastecimiento, minimo, notas } = req.body ?? {};
    if (!/^[1-9][0-9]{0,18}$/.test(req.params.id) || !['stock','a_pedido'].includes(abastecimiento) || !integer(minimo) || typeof notas !== 'string' || notas.length > 1000) throw fail(400, 'Configuración inválida');
    res.json(await rpc(req, 'configurar', { producto_id: req.params.id, abastecimiento, minimo, notas }));
  });
  for (const [route, file] of [['/interno/inventario','inventory.html'], ['/interno/inventario/app.js','inventory.js'], ['/interno/inventario/style.css','inventory.css']]) {
    app.get(route, protect, (req, res) => res.sendFile(path.join(files, file), { dotfiles: 'allow' }));
  }
}
