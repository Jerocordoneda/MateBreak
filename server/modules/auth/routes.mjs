import {returnPath,returnQuery} from '../../../src/features/account/return-path.mjs';
import {parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import { accountRole } from '../account/routes.mjs';
const fail = (status, message) => Object.assign(new Error(message), { status });
export function authRoutes(app, { admin, config, authFactory, rpc, rotateCart }) {
  const secure=config.origin.startsWith('https:'),returnCookie=(secure?'__Host-':'')+'mb_auth_return';
  const setReturn=(res,value,maxAge=3600)=>res.append('Set-Cookie',serializeCookieHeader(returnCookie,value,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge}));
  app.get('/api/sesion', async (req, res) => res.json({ usuario: req.user ? { id: req.user.id, email: req.user.email, rol: await accountRole(admin,req.user) } : null }));
  app.post('/api/auth/registro', async (req, res) => {
    const { email, password, nombre } = req.body ?? {};
    if (typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.length > 150) throw fail(400,'Indicá tu nombre y apellido');
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 10 || password.length > 128) throw fail(400, 'Indicá email y contraseña de al menos 10 caracteres');
    const volver=returnPath(req.body?.volver)?req.body.volver:null;
    setReturn(res,volver||'',volver?3600:0);
    // Only display data is accepted. No role or membership is created here.
    const { data, error } = await req.auth.auth.signUp({ email:email.trim().toLowerCase(), password, options: { data:{nombre:nombre.trim()}, emailRedirectTo: config.origin + '/auth/callback'+returnQuery(volver) } });
    if (error) throw fail(400, 'No se pudo registrar. Revisá los datos o intentá más tarde.');
    res.json({ sesion_iniciada:!!data?.session, mensaje: 'Si el email puede registrarse, recibirás un enlace para confirmar tu cuenta. Si ya tenés una cuenta, ingresá con tu contraseña.' });
  });
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') throw fail(400, 'Faltan credenciales');
    const { data, error } = await req.auth.auth.signInWithPassword({ email, password });
    if (error) throw fail(401, 'Email o contraseña incorrectos');
    req.user = data.user;
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
  app.get('/auth/callback', async (req, res) => {
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    const cookie=parseCookieHeader(req.headers.cookie??'').find(c=>c.name===returnCookie)?.value;
    const volver=returnPath(req.query.volver)?req.query.volver:returnPath(cookie)?cookie:null;
    const failure='/mi-cuenta'+returnQuery(volver)+(volver?'&':'?')+'auth=error';
    const auth=authFactory(req,res);let result;
    if(typeof req.query.code==='string')result=await auth.auth.exchangeCodeForSession(req.query.code);
    else if(typeof req.query.token_hash==='string'&&['email','signup'].includes(req.query.type))result=await auth.auth.verifyOtp({token_hash:req.query.token_hash,type:req.query.type});
    else return res.redirect(failure);
    if(result.error)return res.redirect(failure);
    const verified=await auth.auth.getUser();
    if(verified.error||!verified.data?.user||verified.data.user.is_anonymous)return res.redirect(failure);
    setReturn(res,'',0);res.redirect(returnPath(volver)||'/mi-cuenta');
  });
}
