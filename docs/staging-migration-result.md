# Resultado de migraciones Staging — 2026-10-01

Este informe registra el cierre de la fase de migraciones, anterior a los fixtures.
La aplicación posterior autorizada consta en
[staging-fixtures-result.md](staging-fixtures-result.md).

Destino exclusivo: matebreak-staging, rxccjczyywhewqqdfgxm.
Commit aprobado: 308b1d10784e43b256fa0dbf272b5233c877f477. CLI 2.118.0.

El dry-run terminó con exit code 0 y exactamente las 26 migraciones, ordenadas,
sin seeds ni roles adicionales. El programa comparó la lista exacta contra los
26 archivos. Inmediatamente antes del push se confirmó identidad, historial
vacío y cero tablas de aplicación; se verificaron commit, hashes SHA-256 y
ausencia de supabase/.temp/project-ref. No se cargó .env.

El push usó --project-ref rxccjczyywhewqqdfgxm y --skip-vault, --workdir explícito,
sin migration repair, --include-all, --include-seed ni --include-roles.
Se confirmó el prompt con la lista exacta autorizada. Terminó con exit code 0:
Finished supabase db push. Las 26 versiones/nombres aparecen en el historial.
El bootstrap y las otras migraciones se ejecutaron correctamente en Cloud.

## Auditoría posterior de sólo lectura

- 50 tablas, 341 columnas, 234 constraints, 111 índices.
- 46 funciones, 12 triggers de aplicación, 4 secuencias y 9 policies.
- Todas las tablas públicas tienen RLS; ningún constraint sin validar.
- Ningún trigger de aplicación deshabilitado. ensure_rls activo, owner postgres.
- Cero SECURITY DEFINER de aplicación ejecutables por anon/authenticated.
- Los grants de tablas a authenticated corresponden a las 7 tablas con policies
  de perfil/contacto/dirección y consulta de pedidos, pagos y envíos.
- Defaults de public del creador postgres sin grants implícitos a anon/authenticated;
  PUBLIC EXECUTE global revocado. Defaults administrados de Storage sin cambios.
- Cero servidores externos/subscripciones PostgreSQL.
- Cero usuarios, pedidos, ventas manuales y objetos Storage.

La referencia local guardada cubría 24 migraciones: 47 tablas y 35 funciones.
La comparación no encuentra objetos anteriores faltantes ni cambios en sus
tablas, constraints, índices, policies, triggers, secuencias o ACLs. Las adiciones
y el reemplazo de mb_checkout_minorista corresponden a las dos últimas
migraciones aprobadas de logística: nuevas tablas privadas, columnas de snapshot,
triggers de inmutabilidad y RPC logísticos. No se afirma igualdad literal con
una referencia local de 26 migraciones que no estaba guardada.

Security Advisor devuelve únicamente INFO rls_enabled_no_policy (43 tablas).
Es el diseño de acceso mediante backend/service_role: RLS sin policy deniega
acceso directo de usuarios. No se añadieron policies permisivas para silenciarlo.
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Esto es una auditoría estructural y de permisos, no validación funcional externa
de registro, checkout, Storage o conectividad Render. Esas pruebas siguen pendientes.

## Límites preservados

No se ejecutaron fixtures, ni se crearon usuarios, proyectos, workers o buckets.
El catálogo histórico embebido en la migración existe; sigue pendiente la
preparación del fixture sintético que oculta ese catálogo para las pruebas.
No se conectó GitHub Integration, no hubo despliegues Render/Vercel, ni llamadas
a Mercado Pago/MiCorreo. No se consultó ni modificó Supabase productivo.
supabase/platform/harden-admin-defaults.sql no se ejecutó.

Evidencia: staging-evidence/staging-cli-dry-run.log,
staging-evidence/staging-migration-readiness.json (inspección previa y hashes),
staging-evidence/staging-cloud-schema.json,
staging-evidence/staging-cloud-schema-comparison.json,
staging-evidence/staging-security-advisors.json.
Los archivos son locales y no se publicaron ni cambiaron el commit aprobado.
