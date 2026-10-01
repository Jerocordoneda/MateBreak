# Supabase local en Windows

Validado el 30/09/2026 desde `main` / `15c9d64`: dos resets desde cero y suite local completa. Docker aloja Supabase; Node sigue con `npm run dev`. Ver [DDL, catálogo y drift](schema-reconstruction.md).

## Primera instalación

1. Instalá [Docker Desktop para Windows](https://docs.docker.com/desktop/setup/install/windows-install/) con backend WSL 2 si tu equipo lo admite. Abrí Docker Desktop y esperá a que el motor indique que está activo. En una terminal nueva verificá `docker --version`, `docker compose version` y `docker info`. Si `docker info` falla, no sigas al reset.
2. En la carpeta del proyecto ejecutá `npm ci`. La Supabase CLI está fijada en `package-lock.json`; verificá `npx supabase --version`.
3. Usá un checkout/worktree separado. Conservá el `.env` remoto en su ubicación original: **no lo copies ni lo uses para pruebas**. Para desarrollo manual creá un `.env` local desde `.env.example` con URL localhost, `MATEBREAK_LOCAL_ONLY=1` y ambos proveedores mock. No pegues claves en chats, commits ni logs.
4. Ejecutá `npm run supabase:start`. Cuando arranque, consultá `npx supabase status` en tu propia terminal y copiá **solo a tu `.env` ignorado por Git** la clave local `anon` en `SUPABASE_PUBLISHABLE_KEY` y la clave local `service_role` en `SUPABASE_SECRET_KEY`. Nunca uses claves del proyecto real.
5. Ejecutá `npm run supabase:reset:local`. Usa exclusivamente `supabase db reset --local --no-seed`; el guard exige Docker activo, `project_id`/puertos locales y que las URLs presentes en `.env` sean loopback. No acepta argumentos adicionales ni `--linked`.
6. `npm run supabase:status` muestra endpoints sin claves. Los wrappers verifican ownership del worktree y destinos locales. **Límite comprobado en este Docker Desktop:** CLI publica 54321–54324 en todas las interfaces. La opción de binding del bridge no lo corrigió; no se afirma aislamiento de la LAN. La suite detiene Supabase al terminar, conservando volúmenes. Antes de dejarlo funcionando de forma permanente, hay que configurar/verificar bindings explícitos o una restricción de red local por un mecanismo soportado. No se modificó el firewall/daemon global.
7. Ejecutá `npm run dev` en otra terminal. La aplicación queda en `http://localhost:3000`. `MATEBREAK_LOCAL_ONLY=1` hace fallar el arranque si la API Supabase no apunta a localhost:54321 o si pagos/envíos no están en mock.
8. Para apagar: `npm run supabase:stop`. Conserva los volúmenes locales; el reset local es el comando explícito para reconstruir la DB descartable.

`supabase/config.toml` se creó con Supabase CLI 2.118.0. Configura puertos 54321/54322/54323, Auth local, Storage y el bucket ficticio `product-images`, sin seed ni datos de producción. Los servicios no necesarios (Realtime, Edge Runtime y Analytics) están desactivados. Las migraciones históricas permanecen en `supabase/migrations/`.

## Tests reproducibles

`npm run test:local` (`test:full` es el mismo alias exclusivamente local) no carga `.env`, rechaza credenciales heredadas, descubre claves locales en memoria y verifica labels/destinos. Ejecuta Node 133/133 (incluye 53 MiCorreo), SQL histórico 18/18 y SQL logístico con rollback, privilegios 1/1, stock concurrente 20/20, lifecycle 9/9, concurrencia minorista 2/2, Auth/JWT/RLS A/B/anon, 10 RPC service-only, SECURITY DEFINER, Storage y checkout mock. Dos workers logísticos locales importan un bulto pagado exactamente una vez usando mock. Al final detiene su clúster PostgreSQL descartable sin puertos publicados, resetea Supabase local para quitar cuentas/pedidos ficticios y detiene ese stack preservando volúmenes.

El mock por defecto sigue siendo efímero. Para reservas/pedidos reales locales, activá `MATEBREAK_LOCAL_PERSIST_MOCK=1` junto con `MATEBREAK_LOCAL_ONLY=1` y ambos proveedores mock. Exige login y localhost:54321; no puede arrancar en producción. Approved confirma, rejected cancela/libera y pending mantiene la reserva local. La suite prepara métodos/stock ficticios y los limpia mediante reset.

`catalog:historical:check` verifica la generación determinista del snapshot. `inspect:local` captura metadatos; `inspect:remote` **solo imprime una consulta READ ONLY** para el conector, sin conectarse ni cargar claves. `schema:compare` compara los JSON capturados, ignorando formato/comentarios SQL y conservando literales.

Las imágenes del catálogo son metadatos: no se suben binarios al reset. Los tests de Storage usan su propio PNG ficticio. Los defaults del rol interno supabase_admin requieren operación de plataforma separada; no se aplicaron remotamente.

Nunca ejecutes `supabase db reset --linked` ni un reset con URL remota. Los scripts npm locales no tienen esa opción. Una clave local generada no debe copiarse a staging o producción.
