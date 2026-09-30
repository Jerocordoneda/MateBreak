# Supabase local en Windows

Estado: preparado en el repositorio, **pendiente de ejecutar** porque Docker Desktop no estaba instalado/disponible el 2026-09-29. Docker solo aloja servicios locales de Supabase; Node y el frontend siguen con `npm run dev`.

## Primera instalación

1. Instalá [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/) con backend WSL 2 si tu equipo lo admite. Abrí Docker Desktop y esperá a que el motor indique que está activo. En una terminal nueva verificá `docker --version`, `docker compose version` y `docker info`. Si `docker info` falla, no sigas al reset.
2. En la carpeta del proyecto ejecutá `npm ci`. La Supabase CLI está fijada en `package-lock.json`; verificá `npx supabase --version`.
3. Si tu `.env` actual apunta a Supabase remoto, **no lo uses para pruebas locales**. Conservá sus credenciales fuera del repositorio en tu gestor de secretos y reemplazá `.env` por una copia de `.env.example`. Debe quedar `SUPABASE_URL=http://127.0.0.1:54321`, `MATEBREAK_LOCAL_ONLY=1`, `SHIPPING_MODE=mock`, `PAYMENTS_MODE=mock` y `APP_ORIGIN=http://localhost:3000`. No pegues claves en chats, commits ni logs.
4. Ejecutá `npm run supabase:start`. Cuando arranque, consultá `npx supabase status` en tu propia terminal y copiá **solo a tu `.env` ignorado por Git** la clave local `anon` en `SUPABASE_PUBLISHABLE_KEY` y la clave local `service_role` en `SUPABASE_SECRET_KEY`. Nunca uses claves del proyecto real.
5. Ejecutá `npm run supabase:reset:local`. Usa exclusivamente `supabase db reset --local --no-seed`; el guard exige Docker activo, `project_id`/puertos locales y que las URLs presentes en `.env` sean loopback. No acepta argumentos adicionales ni `--linked`.
6. Confirmá con `npm run supabase:status` que API, PostgreSQL, Auth, Studio y Storage estén locales. Revisá con `docker ps` que los puertos publicados no estén expuestos a otra red; si lo están, detené el stack y corregí la configuración de Docker/firewall antes de continuar.
7. Ejecutá `npm run dev` en otra terminal. La aplicación queda en `http://localhost:3000`. `MATEBREAK_LOCAL_ONLY=1` hace fallar el arranque si la API Supabase no apunta a localhost:54321 o si pagos/envíos no están en mock.
8. Para apagar: `npm run supabase:stop`. Conserva los volúmenes locales; el reset local es el comando explícito para reconstruir la DB descartable.

`supabase/config.toml` se creó con Supabase CLI 2.118.0. Configura puertos 54321/54322/54323, Auth local, Storage y el bucket ficticio `product-images`, sin seed ni datos de producción. Los servicios no necesarios (Realtime, Edge Runtime y Analytics) están desactivados. Las migraciones históricas permanecen en `supabase/migrations/`.

## Qué falta comprobar cuando Docker funcione

El primer reset debe demostrar que todas las migraciones se aplican desde una base vacía, incluidas `20260929204150_fix_minorista_checkout_lifecycle.sql` y `20260929214717_harden_default_privileges.sql`. Si falla, conservar el error y corregir dependencias con migraciones nuevas; no copiar datos productivos. Después preparar fixtures ficticios y ejecutar los 18 SQL históricos, Auth local, JWT/RLS A/B, anon, RPC, SECURITY DEFINER, Storage y checkout mock completo. **Esos resultados no existen aún en esta iteración.** Por eso todavía no hay un `test:full` que pudiera declarar éxito engañosamente.

Los tests independientes siguen disponibles con `npm test`. Los tests de concurrencia y lifecycle existentes requieren un PostgreSQL aislado y descartable; no deben apuntar al proyecto real.

Nunca ejecutes `supabase db reset --linked` ni un reset con URL remota. Los scripts npm locales no tienen esa opción. Una clave local generada no debe copiarse a staging o producción.
