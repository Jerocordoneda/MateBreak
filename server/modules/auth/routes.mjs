import { accountRole } from '../account/routes.mjs';
const fail = (status, message) => Object.assign(new Error(message), { status });
export function authRoutes(app, { admin, config, authFactory, rpc, rotateCart }) {
  app.get('/api/sesion', async (req, res) => res.json({ usuario: req.user ? { id: req.user.id, email: req.user.email, rol: await accountRole(admin,req.user) } : null }));
  app.post('/api/auth/registro', async (req, res) => {
    const { email, password, nombre } = req.body ?? {};
    if (typeof nombre !== 'string' || nombre.trim().length < 2 || nombre.length > 150) throw fail(400,'Indicá tu nombre y apellido');
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 10 || password.length > 128) throw fail(400, 'Indicá email y contraseña de al menos 10 caracteres');
    // Only display data is accepted. No role or membership is created here.
    const { data, error } = await req.auth.auth.signUp({ email:email.trim().toLowerCase(), password, options: { data:{nombre:nombre.trim()}, emailRedirectTo: config.origin + '/auth/callback' } });
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
    res.set('Cache-Control', 'private, no-store');
    if (typeof req.query.code !== 'string') return res.redirect('/mi-cuenta?auth=error');
    const auth = authFactory(req, res);
    const { error } = await auth.auth.exchangeCodeForSession(req.query.code);
    res.redirect(error ? '/mi-cuenta?auth=error' : '/mi-cuenta');
  });
}
