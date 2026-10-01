import path from 'node:path';
import {accountRole} from '../modules/account/routes.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function logisticsAdminRoutes(app,{admin,authFactory}) {
 const protect=async(req,res,next)=>{
  res.set({'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow',
   'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
  if(!req.auth){req.auth=authFactory(req,res);const r=await req.auth.auth.getUser();req.user=r.error?null:r.data?.user;}
  if(!req.user)throw fail(401,'Iniciá sesión para continuar');
  if(await accountRole(admin,req.user)!=='administrador')throw fail(403,'Acceso exclusivo de administradores');
  next();
 };
 const rpc=async(req,action,data)=>{
  const r=await admin.rpc('mb_logistics_admin',{p_actor_id:req.user.id,p_action:action,p_data:data});
  if(r.error)throw fail(r.error.code==='42501'?403:409,'No se pudo completar la acción. Actualizá el bulto y revisá la verificación.');
  return r.data;
 };
 app.use('/api/admin/logistica',protect);
 app.get('/api/admin/logistica',async(req,res)=>{
  const page=Number(req.query.page??1),state=req.query.state??'problems';
  if(!Number.isInteger(page)||page<1||page>10000||!['problems','all','pendiente','procesando','importado','error','revision'].includes(state))throw fail(400,'Filtro inválido');
  res.json(await rpc(req,'list',{page,state}));
 });
 app.get('/api/admin/logistica/:order/:parcel/historial',async(req,res)=>{
  const parcel=Number(req.params.parcel);
  if(!uuid(req.params.order)||!Number.isInteger(parcel)||parcel<1||parcel>20)throw fail(400,'Bulto inválido');
  res.json(await rpc(req,'history',{orderId:req.params.order,parcelNumber:parcel}));
 });
 app.post('/api/admin/logistica/:order/:parcel/acciones',async(req,res)=>{
  const b=req.body??{},parcel=Number(req.params.parcel);
  if(!uuid(req.params.order)||!Number.isInteger(parcel)||parcel<1||parcel>20||!uuid(b.actionId)
   ||!['verified_import','safe_retry','keep_review'].includes(b.action)
   ||!['revision','error','procesando'].includes(b.expectedState)||!Number.isInteger(b.expectedAttempts)||b.expectedAttempts<0
   ||!(b.expectedClaimId===null||uuid(b.expectedClaimId)))throw fail(400,'Acción inválida');
  const data={orderId:req.params.order,parcelNumber:parcel,actionId:b.actionId,expectedState:b.expectedState,
   expectedAttempts:b.expectedAttempts,expectedClaimId:b.expectedClaimId};
  if(b.action==='keep_review')Object.assign(data,{verification:'unresolved'});
  else {
   if(b.confirmed!==true||!['portal','support'].includes(b.source)||typeof b.reference!=='string'||!/^[A-Za-z0-9_-]{3,80}$/.test(b.reference))throw fail(400,'Comprobá por medios oficiales e indicá una referencia sin secretos');
   Object.assign(data,{confirmed:true,source:b.source,reference:b.reference,verification:b.action==='safe_retry'?'absent':'exists'});
   if(b.action==='verified_import'){
    if(typeof b.createdAt!=='string'||b.createdAt.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(b.createdAt)||!Number.isFinite(Date.parse(b.createdAt)))throw fail(400,'Fecha oficial inválida; indicá fecha, hora y zona');
    data.createdAt=new Date(b.createdAt).toISOString();
   }
  }
  res.json(await rpc(req,b.action,data));
 });
 const files=path.resolve(import.meta.dirname,'../private-ui');
 for(const [route,file]of[['/interno/logistica','logistics.html'],['/interno/logistica/app.js','logistics.js'],['/interno/logistica/style.css','logistics.css']])
  app.get(route,protect,(req,res)=>res.sendFile(path.join(files,file), { dotfiles: 'allow' }));
}
