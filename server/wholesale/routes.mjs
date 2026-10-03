import {verifiedWholesaleSession} from './access.mjs';
import {commercialContext} from './context.mjs';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {provinces} from '../shipping/provinces.mjs';
import {buyer,selection,whatsappMessage,whatsappNumber} from './policy.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function wholesaleRoutes(app,{admin,config}){
 const secure=config.origin.startsWith('https:'),prefix=secure?'__Host-':'',refName=prefix+'mb_wholesale_ref';
 const cookie=(req,name)=>parseCookieHeader(req.headers.cookie||'').find(c=>c.name===name)?.value;
 const source=req=>{const ref=cookie(req,refName);if(!ref||ref==='web')return null;if(!/^[a-zA-Z0-9_-]{3,64}$/.test(ref))throw fail(400,'Referencia comercial inválida');return ref;};
 const rpc=async(name,args)=>{const result=await admin.rpc(name,args);if(result.error)throw fail(result.error.code==='42501'?403:result.error.code==='P0001'?409:503,['P0001','42501'].includes(result.error.code)?result.error.message:'No se pudo procesar la solicitud mayorista');return result.data;};
 const setCookie=(res,name,value)=>res.append('Set-Cookie',serializeCookieHeader(name,value,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:2592000}));
 app.use('/api/mayorista',async(req,res,next)=>{req.wholesaleSession=await verifiedWholesaleSession(req,admin);if(req.headers['x-matebreak-account']&&req.headers['x-matebreak-account']!==req.user.id)throw fail(401,'La cuenta cambió. Volvé a ingresar al catálogo.');next();});
 app.get('/api/mayorista/catalogo',async(req,res)=>{
  let ref=source(req);const existing=cookie(req,refName);
  if(!existing&&req.query.ref!==undefined){if(typeof req.query.ref!=='string'||!/^[a-zA-Z0-9_-]{3,64}$/.test(req.query.ref))throw fail(400,'Referencia comercial inválida');ref=req.query.ref;}
  const catalog=await rpc('mb_wholesale_catalog',{p_ref:ref});if(!catalog.referenceValid)throw fail(400,'Referencia comercial no disponible');
  if(!existing)setCookie(res,refName,ref||'web');
  const items=catalog.items.map(i=>{const {imagePath,...item}=i;return{...item,image:item.image||(imagePath?admin.storage.from('product-images').getPublicUrl(imagePath).data.publicUrl:null)};});
  res.json({accountId:req.user.id,items,minimum:catalog.minimum,provinces,contactReady:/^[1-9]\d{9,14}$/.test(config.wholesaleWhatsapp||''),contactUrl:/^[1-9]\d{9,14}$/.test(config.wholesaleWhatsapp||'')?'https://wa.me/'+config.wholesaleWhatsapp:null});
 });
 app.get('/api/mayorista/acceso',(req,res)=>res.json({accountId:req.user.id}));
 app.get('/api/mayorista/perfil',async(req,res)=>{
  const [profile,addresses]=await Promise.all([req.auth.from('perfil').select('nombre,telefono').eq('id',req.user.id).maybeSingle(),req.auth.from('direccion').select('id,destinatario,telefono,calle,ciudad,departamento,pais').eq('usuario_id',req.user.id).order('creado_en')]);
  if(profile.error||addresses.error)throw fail(503,'No pudimos cargar tus datos. Podés completarlos manualmente.');
  res.json(commercialContext(req.user,profile.data,addresses.data||[]));
 });
 app.post('/api/mayorista/cotizar',async(req,res)=>res.json(await rpc('mb_wholesale_quote',{p_items:selection(req.body?.items)})));
 app.post('/api/mayorista/solicitudes',async(req,res)=>{
  const phone=whatsappNumber(config.wholesaleWhatsapp);
  if(!uuid(req.body?.idempotencia))throw fail(400,'Reabrí el catálogo antes de enviar');
  const data=buyer(req.body?.comprador),items=selection(req.body?.items);
  const receipt=await rpc('mb_wholesale_submit_account',{p_user:req.user.id,p_session:req.wholesaleSession,p_key:req.body.idempotencia,p_buyer:data,p_items:items,p_ref:source(req)});
  const message=whatsappMessage(receipt);res.status(201).json({...receipt,message,whatsappUrl:'https://wa.me/'+phone+'?text='+encodeURIComponent(message)});
 });
 app.get('/api/mayorista/solicitudes',async(req,res)=>res.json(await rpc('mb_wholesale_own',{p_user:req.user.id,p_session:req.wholesaleSession,p_id:null})));
 app.get('/api/mayorista/solicitudes/:id',async(req,res)=>{if(!uuid(req.params.id))throw fail(400,'Solicitud inválida');const rows=await rpc('mb_wholesale_own',{p_user:req.user.id,p_session:req.wholesaleSession,p_id:req.params.id});if(!rows.length)throw fail(404,'Solicitud no encontrada');res.json(rows[0]);});
 app.get('/api/admin/mayorista',async(req,res)=>{if(!req.user)throw fail(401,'Iniciá sesión');res.json(await rpc('mb_wholesale_manage',{p_actor:req.user.id,p_action:'list',p_data:{}}));});
 app.post('/api/admin/mayorista/estado',async(req,res)=>{
  if(!req.user)throw fail(401,'Iniciá sesión');const b=req.body||{};
  if(!uuid(b.id)||!['en_conversacion','presupuesto_confirmado','esperando_sena','sena_acreditada','venta_concretada','cancelada'].includes(b.state)||[b.closer,b.orderId,b.manualSaleId].some(v=>v!=null&&!uuid(v))||typeof (b.note??'')!=='string'||(b.note||'').length>500)throw fail(400,'Estado comercial inválido');
  const data={id:b.id,state:b.state,note:b.note||'',...(b.closer?{closer:b.closer}:{}),...(b.orderId?{orderId:b.orderId}:{}),...(b.manualSaleId?{manualSaleId:b.manualSaleId}:{})};
  res.json(await rpc('mb_wholesale_manage',{p_actor:req.user.id,p_action:'state',p_data:data}));
 });
}
