import { createApp } from './app.mjs';
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT debe ser un puerto válido entre 1 y 65535.');
const config = {
  url: process.env.SUPABASE_URL,
  publishable: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY,
  secret: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  origin: process.env.APP_ORIGIN || (!production ? `http://localhost:${port}` : ''),
  production,
};
for (const key of ['url','publishable','secret','origin']) if (!config[key]) throw Error(`Falta configuración ${key}. Completá .env siguiendo .env.example.`);
const { app, admin } = createApp(config);
app.listen(port, () => console.log(`MateBreak: ${config.origin}/ · Mi cuenta: ${config.origin}/mi-cuenta`));
let expiring = false;
const expire = async () => {
  if (expiring) return;
  expiring = true;
  try {
    const { error } = await admin.rpc('mb_expirar_reservas');
    if (error) console.error('No se pudieron liberar reservas vencidas:', error.code);
  } catch { console.error('Fallo de conexión al liberar reservas'); }
  finally { expiring = false; }
};
await expire();
setInterval(expire, 60000).unref();
