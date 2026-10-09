import {accountRole} from '../modules/account/routes.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export function retailAdminRoutes(app,{admin,requireUser,uuid}){
 const protect=async(req,res)=>{
  const actor=requireUser(req);
  if(await accountRole(admin,req.user)!=='administrador')throw fail(403,'Solo administración puede gestionar pedidos');
  res.set({'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'});
  return actor;
 };
 const call=async(actor,action,data)=>{
  const r=await admin.rpc('mb_retail_order_admin',{p_actor_id:actor,p_action:action,p_data:data});
  if(r.error)throw fail(r.error.code==='42501'?403:409,'No se pudo completar la acción. Actualizá el pedido y revisá su estado.');
  return r.data;
 };
 app.get('/api/admin/pedidos',async(req,res)=>{
  const actor=await protect(req,res),page=Number(req.query.pagina??1);
  if(!Number.isInteger(page)||page<1||page>10000)throw fail(400,'Página inválida');
  res.json(await call(actor,'list',{page}));
 });
 app.post('/api/admin/pedidos/:id/acciones',async(req,res)=>{
  const actor=await protect(req,res),b=req.body??{};
  if(!uuid(req.params.id)||!uuid(b.actionId)||!['prepare','deliver','cancel','expire'].includes(b.action)
   ||!['pendiente_pago','pagado','en_preparacion','enviado','entregado','cancelado','expirado'].includes(b.expectedState))
   throw fail(400,'Acción inválida');
  res.json(await call(actor,b.action,{orderId:req.params.id,actionId:b.actionId,expectedState:b.expectedState}));
 });
}
