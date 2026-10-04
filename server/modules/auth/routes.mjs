import {returnPath,returnQuery} from '../../../src/features/account/return-path.mjs';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import { accountRole } from '../account/routes.mjs';
import {registration,persistRegistration} from '../../wholesale/profile.mjs';
import {provinces} from '../../shipping/provinces.mjs';
const fail = (status, message) => Object.assign(new Error(message), { status });
export function authRoutes(app, { admin, config, authFactory, rpc, rotateCart, verifyLiveSession }) {
  const secure=config.origin.startsWith('https:'),returnCookie=(secure?'__Host-':'')+'mb_auth_return';
  const setReturn=(res,value,maxAge=3600)=>res.append('Set-Cookie',serializeCookieHeader(returnCookie,value,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge}));
  app.get('/api/provincias',(req,res)=>res.json(provinces));
  app.get('/api/sesion', async (req, res) => res.json({ usuario: req.user ? { id: req.user.id, email: req.user.email, rol: await accountRole(admin,req.user) } : null }));
  app.post('/api/auth/registro', async (req, res) => {
    const { email, password, nombre } = req.body ?? {};
    if (typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.length > 150) throw fail(400,'Indicá tu nombre y apellido');
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 10 || password.length > 128) throw fail(400, 'Indicá email y contraseña de al menos 10 caracteres');
    const volver=returnPath(req.body?.volver)?req.body.volver:null;
    const commercial=registration(req.body);
    setReturn(res,volver||'',volver?3600:0);
    // Only display data is accepted. No role or membership is created here.
    const { data, error } = await req.auth.auth.signUp({ email:email.trim().toLowerCase(), password, options: { data:{nombre:commercial?.nombre||nombre.trim(),...(commercial?{mayorista:commercial}:{})}, emailRedirectTo: config.origin + '/auth/callback'+returnQuery(volver) } });
    if (error) {
      if(error.code==='email_address_not_authorized'||error.code==='over_email_send_rate_limit'||error.status===429)throw fail(503,'La confirmación por correo no está disponible en este momento. Esperá antes de reintentar o contactá a MateBreak.');
      throw fail(400, 'No se pudo registrar. Revisá los datos o intentá más tarde.');
    }
    if(data?.session)await persistRegistration(req.auth,data.user);
    res.json({ sesion_iniciada:!!data?.session, mensaje: 'Si el email puede registrarse, recibirás un enlace para confirmar tu cuenta. Si ya tenés una cuenta, ingresá con tu contraseña.' });
  });
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') throw fail(400, 'Faltan credenciales');
    const { data, error } = await req.auth.auth.signInWithPassword({ email, password });
    if (error) throw fail(401, 'Email o contraseña incorrectos');
    req.user = data.user;
    await verifyLiveSession(req,admin);
    await persistRegistration(req.auth,data.user);
    // Keep the random guest-cart credential so the existing cart is attached.
    // Supabase Auth issues a fresh login session independently of this cookie.
    try { await rpc(req, 'vincular'); }
    catch (error) {
      if (!['Sesion invalida', 'El carrito vencio'].includes(error.message)) throw error;
      rotateCart(req, res); await rpc(req, 'vincular');
    }
    res.json({ usuario: { id: data.user.id, email: data.user.email } });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const { error } = await req.auth.auth.signOut();
    if (error) throw fail(503, 'No se pudo cerrar la sesión. Reintentá.');
    rotateCart(req, res); res.json({ ok: true });
  });
  // Future branded template: user-initiated POST avoids link scanner consumption
  // and token-hash verification also works without a PKCE verifier cookie.
  app.post('/api/auth/confirmar', async (req,res)=>{
    const {token_hash,type,volver}=req.body??{};
    if(typeof token_hash!=='string'||!/^[a-zA-Z0-9_-]{20,256}$/.test(token_hash)||type!=='email')throw fail(400,'El enlace de confirmación es inválido.');
    const result=await req.auth.auth.verifyOtp({token_hash,type:'email'});
    if(result.error)throw fail(400,'El enlace de confirmación venció o ya fue utilizado. Si ya confirmaste tu correo, iniciá sesión.');
    const verified=await req.auth.auth.getUser();
    if(verified.error||!verified.data?.user||verified.data.user.is_anonymous)throw fail(400,'No pudimos verificar la confirmación de tu cuenta.');
    await persistRegistration(req.auth,verified.data.user);
    setReturn(res,'',0);
    res.json({next:'/mi-cuenta'+returnQuery(volver)+(returnPath(volver)?'&':'?')+'auth=confirmed'});
  });
  app.get('/auth/callback', async (req, res) => {
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    const cookie=parseCookieHeader(req.headers.cookie??'').find(c=>c.name===returnCookie)?.value;
    const volver=returnPath(req.query.volver)?req.query.volver:returnPath(cookie)?cookie:null;
    const failure='/mi-cuenta'+returnQuery(volver)+(volver?'&':'?')+'auth=error';
    if(req.query.error || req.query.error_code)return res.redirect(failure);
    const auth=authFactory(req,res);let result;
    if(typeof req.query.code==='string')result=await auth.auth.exchangeCodeForSession(req.query.code);
    else if(typeof req.query.token_hash==='string'&&['email','signup'].includes(req.query.type))result=await auth.auth.verifyOtp({token_hash:req.query.token_hash,type:req.query.type});
    else return res.redirect(failure);
    if(result.error)return res.redirect(failure);
    const verified=await auth.auth.getUser();
    if(verified.error||!verified.data?.user||verified.data.user.is_anonymous)return res.redirect(failure);
    try{await persistRegistration(auth,verified.data.user);}catch{return res.redirect(failure);}
    setReturn(res,'',0);res.redirect('/mi-cuenta'+returnQuery(volver)+(volver?'&':'?')+'auth=confirmed');
  });
}
