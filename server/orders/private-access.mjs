import {randomBytes,createHash} from 'node:crypto';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
const fail=(status,message)=>Object.assign(Error(message),{status});
export const digestCapability=token=>createHash('sha256').update(token).digest('hex');
export const newCapability=()=>randomBytes(32).toString('base64url');
export const isCapability=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function privateOrderRoutes(app,{admin,config}){
 const name=config.origin.startsWith('https:')?'__Host-mb_order':'mb_order';
 const rpc=async(name,args)=>{const r=await admin.rpc(name,args);if(r.error)throw fail(503,'No se pudo consultar el pedido');return r.data;};
 app.use('/api/seguimiento',(req,res,next)=>{
  res.set({'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer'});next();
 });
 app.post('/api/seguimiento/intercambiar',async(req,res)=>{
  if(!isCapability(req.body?.credencial))throw fail(404,'Enlace no disponible o vencido');
  const session=newCapability();
  const id=await rpc('mb_exchange_order_link',{p_link_hash:digestCapability(req.body.credencial),p_session_hash:digestCapability(session)});
  if(!id)throw fail(404,'Enlace no disponible o vencido');
  res.append('Set-Cookie',serializeCookieHeader(name,session,{path:'/',httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'strict',maxAge:86400}));
  res.json({pedido:id});
 });
 app.get('/api/seguimiento/:id',async(req,res)=>{
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id))throw fail(404,'Pedido no disponible');
  const session=parseCookieHeader(req.headers.cookie||'').find(c=>c.name===name)?.value;
  if(!isCapability(session))throw fail(404,'Pedido no disponible');
  const order=await rpc('mb_read_order_link',{p_order_id:req.params.id,p_session_hash:digestCapability(session)});
  if(!order)throw fail(404,'Pedido no disponible');res.json(order);
 });
 app.post('/api/seguimiento/renovar',async(req,res)=>{
  const {numero,email}=req.body||{};
  if(typeof numero!=='string'||!/^[A-Za-z0-9-]{1,40}$/.test(numero)||typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
   throw fail(400,'Revisá el número y el correo');
  await rpc('mb_request_order_link',{p_number:numero,p_email:email});
  res.status(202).json({mensaje:'Si los datos corresponden a una compra, recibirás un enlace privado.'});
 });
}
