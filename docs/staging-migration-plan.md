# Plan de migraciones Supabase Staging

Registro histórico de la inspección previa. El login y dry-run se completaron
después; las 26 migraciones fueron aplicadas. Consultar el estado posterior en
[staging-migration-result.md](staging-migration-result.md) y
[staging-fixtures-result.md](staging-fixtures-result.md). No repetir el push de este plan.

Inspección de sólo lectura realizada el 2026-10-01. No se aplicó SQL de aplicación.

## Destino y evidencia

- Proyecto: matebreak-staging.
- Referencia exclusiva: rxccjczyywhewqqdfgxm.
- API: https://rxccjczyywhewqqdfgxm.supabase.co.
- Host DB: db.rxccjczyywhewqqdfgxm.supabase.co.
- Región: us-west-2. Estado: ACTIVE_HEALTHY. PostgreSQL: 17.11.
- Commit inspeccionado: 308b1d10784e43b256fa0dbf272b5233c877f477.
- Historial remoto: cero migraciones; tabla schema_migrations aún inexistente.
- Cero tablas public/private, usuarios Auth y objetos Storage.
- Cero servidores externos y suscripciones PostgreSQL.
- 26 archivos SQL, con los 26 SHA-256 físicos idénticos al manifiesto aprobado.

Orden completo y hashes: staging-evidence/staging-migration-readiness.json.
Las consultas remotas usaron project_id explícito y sólo SELECT de metadatos/conteos.
No se consultó ni modificó el proyecto productivo. No se cargó .env ni se usó
un proyecto enlazado implícitamente; supabase/.temp no contiene project-ref.
Esto verifica nuestro camino de ejecución, no las claves que el operador cargó
manualmente en el formulario todavía no creado de Render.

## Plan pendiente

Aplicar todos los archivos en orden ascendente de versión: desde
20260907203437_bootstrap_legacy_catalog hasta 20261001112820_logistics_admin_recovery.
El historial vacío implica 26 pendientes, sin omisiones ni migration repair.

El bootstrap crea las tablas de catálogo, RLS y ensure_rls en esta base nueva.
La migración restore_historical_public_catalog inserta una instantánea pública
embebida en el repositorio; no consulta producción ni importa usuarios/pedidos.
Las URLs de origen del catálogo son metadatos históricos, no conexiones DB.
No ejecutar importadores de catálogo ni proveedores externos.

## Dry-run CLI: bloqueado, no aprobado

CLI instalada: 2.118.0. --help confirmó --project-ref, --dry-run y --skip-vault.
El intento de dry-run finalizó con AccessTokenRequiredError antes de conectarse.
El OAuth del conector no autentica automáticamente esta CLI.
El plan por comparación de historial/archivos NO es una prueba de ejecución SQL.

Después de autenticar oficialmente la CLI, repetir exclusivamente:

```powershell
$stageRef = 'rxccjczyywhewqqdfgxm'
if ($stageRef -ne 'rxccjczyywhewqqdfgxm') { throw 'Target staging incorrecto' }
node node_modules/supabase/dist/supabase.js migration list --project-ref $stageRef
node node_modules/supabase/dist/supabase.js db push --project-ref $stageRef --dry-run --skip-vault
```

Ejecutar desde el worktree staging, con --workdir explícito a ese directorio.
No usar --linked, --db-url, --include-all, --include-seed, --include-roles ni --yes.
No copiar tokens al chat, archivos versionados, Vercel o Render.
La Secret key de runtime no reemplaza la autenticación administrativa CLI.

La aplicación requiere autorización expresa y un dry-run con exactamente estas
26 migraciones. El comando futuro es db push con el mismo --project-ref y
--skip-vault, sin --dry-run. Detenerse ante cualquier cambio de identidad, hash,
plan o error de permisos. No reparar historial ni elevar roles.

## Compatibilidad

Local está configurado con PostgreSQL major_version=17 y Cloud usa 17.11.
El rol postgres no es superusuario, pero sí miembro de supabase_privileged_role;
supautils está configurado con ese rol privilegiado. ensure_rls no existe todavía.
Supabase documenta soporte de event triggers para proyectos nuevos mediante
supautils. No se creó un trigger de prueba porque esta fase es de sólo lectura.
No se identificó un bloqueo en el análisis, pero la ejecución Cloud no está
certificada y db push --dry-run no ejecuta los DDL.

El problema histórico de ALTER DEFAULT PRIVILEGES de supabase_admin ya se separó
a supabase/platform/harden-admin-defaults.sql. Ese archivo no pertenece a las
26 migraciones y no se ejecutará. Sólo se alteran defaults del creador postgres.
No se detectaron usos de ltree, btree_gist, decrypt ni CREATE OPERATOR en las
migraciones que activen las incompatibilidades publicadas para PostgreSQL 17.11.
Después de aplicar, verificar RLS, grants explícitos, RPC autorizados y Data API;
el config.toml local no configura automáticamente el proyecto Cloud.

## Fixtures posteriores, con autorización separada

Antes de crear cuentas/pedidos, ejecutar SET matebreak.environment='staging'
y deploy/staging/fixtures.sql en la misma sesión del destino verificado.
El fixture exige ausencia de usuarios, pedidos y ventas. Oculta el catálogo
histórico y habilita un mate sintético de ARS 10000 con stock de componentes/cajas
100, pagos mock y retiro/correo simulados. No añadir datos personales reales.
Luego crear cuentas ficticias de comprador/administrador y probar permisos;
usar imagen sintética y preparar product-images/policies de Storage por separado.
Las 26 migraciones no crean por sí solas ese bucket.
Los escenarios de checkout generarán pedidos y resultados mock
approved/rejected/pending. El worker logístico requiere preparación/autorización
posterior; este plan no crea servicios ni ejecuta llamadas reales.

## Fuentes

- https://supabase.com/blog/event-triggers-wo-superuser
- https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes
