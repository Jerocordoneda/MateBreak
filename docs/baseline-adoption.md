# Adopción del baseline y migraciones de MateBreak

Referencias inmutables: main 15c9d64; reconstrucción validada 88eee2c0cb9b06ac06d8c8a4200c46d976c9a95b.
Inspección realizada el 30/09/2026 exclusivamente READ ONLY en nwpdfqwqxrkokluqqqfs.
No se modificó history, datos ni schema remoto. Este documento **no autoriza ejecutar** los comandos futuros.

Actualización de liberación: el usuario confirmó **Deploy to production ACTIVADO**
en la integración GitHub de Supabase, rama `main`, working directory `.`, sin
Automatic branching. **No publicar/mergear ni reparar history remoto antes de
deshabilitar explícitamente y verificar ese automatismo.** Ver
[bloqueo confirmado](release-candidate-blocker.md) y
[procedimiento manual por fases](production-release-runbook.md).
El rehearsal se ejecuta únicamente con `--local`; su evidencia está en
`schema-metadata/baseline-rehearsal-result.json`. No confundir ese destino con
los comandos remotos futuros de este documento.

## Evidencia y alcance

El remoto tiene 18 registros, todos con timestamps distintos de los archivos locales equivalentes.
Sus hashes de tokens SQL coinciden 18/18. El comparador preserva literales y nombres y omite
formato/comentarios; no se infirió equivalencia solo por nombre. El MD5 aquí sirve para comparar
contenido conocido, no para autenticar binarios. Metadatos frescos iguales íntegramente al JSON
remote-final-reference: 47 tablas, 302 columnas, 220 constraints, 106 índices, 9 policies y 34 funciones.

Historial capturado: schema-metadata/remote-migration-history.json.
Equivalencias reproducibles: schema-metadata/migration-equivalence.json; generar o verificar
con `node scripts/audit-baseline.mjs` / `node scripts/audit-baseline.mjs --check`.
La consulta remota devuelve versiones, nombres y hashes, nunca filas comerciales ni credenciales.
Las consultas de definición usan pg_catalog. No hay pruebas destructivas remotas.

## Matriz

| migration | local | remote history | schema remoto ya la representa | acción futura requerida |
|---|---|---|---|---|
| 20260907203437 bootstrap_legacy_catalog | Sí | Ausente | Estructura legacy presente; ACL finales dependen del hardening pendiente | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260907203438 commerce | Sí | Ausente | Sí, objetos/funciones/ACL de referencia presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260907205528 restrict_rls_event_function | Sí | Ausente | Sí, objetos/funciones/ACL de referencia presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260908093541 inventory_admin | Sí | 20260908093949 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260908094753 inventory_query_aliases | Sí | 20260908094715 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260908103049 account_roles_sales | Sí | 20260908103456 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260909000858 account_admin_roles | Sí | 20260909001422 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260909234040 admin_commercial_dashboard | Sí | 20260909234523 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260928160916 catalog_import | Sí | 20260928161630 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260928162849 catalog_reconcile_metadata | Sí | 20260928162830 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260928162850 restore_historical_public_catalog | Sí | Ausente | Estado comercial histórico preexistente; sin comparar filas | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260928210316 ars_variant_checkout | Sí | 20260928210655 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260928232227 reconcile_camionero_algarrobo | Sí | 20260928232220 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929000621 physical_base_reconciliation | Sí | 20260929000708 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929000841 on_demand_and_preparation | Sí | 20260929001006 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929001114 receiving_and_engraving_operations | Sí | 20260929001144 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929001306 align_board_procurement | Sí | 20260929001227 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929122500 reconcile_thermo_publications | Sí | 20260929004131 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929130000 box_per_mate_and_combo_mapping | Sí | 20260929005101 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929131500 box_for_manual_sales | Sí | 20260929005232 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929133000 map_premium_personalized_knife_sheath | Sí | 20260929020225 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929144308 checkout_minorista_preparacion | Sí | 20260929150203 | Sí: tokens SQL iguales y metadatos presentes | Adoptar versión local como aplicada; no ejecutar SQL |
| 20260929204150 fix_minorista_checkout_lifecycle | Sí | Ausente | No; cambio pendiente | Aplicar solo después de revisión y staging |
| 20260929214717 harden_default_privileges | Sí | Ausente | No; cambio pendiente | Aplicar solo después de revisión y staging |
| 20261001003824 micorreo_logistics_snapshots | Sí | Ausente | No; cambio pendiente | Aplicar solo después de revisión y staging |

Para catálogo, la afirmación es adopción del estado histórico preexistente, no igualdad de filas
actuales con el archivo comercial. Por la restricción READ ONLY de metadatos no se leyeron esas filas.
Los hashes iguales de las migraciones de reconciliación respaldan el historial comercial ya ejecutado.
La adopción de bootstrap representa la estructura; NO certifica grants/defaults todavía pendientes.

## Estrategia elegida

Conservar los filenames locales canónicos y sus dependencias. En DB nueva, ejecutar las 25
migraciones ordenadas: bootstrap antes de commerce; catálogo después del importador y antes de
los mappings; luego los cambios nuevos. No squashear DML histórico ni mover el catálogo a un
seed final: rompería las assertions intermedias.

En producción existente, registrar las 22 versiones históricas locales como aplicadas sin
ejecutarlas, y retirar solo las 18 entradas de timestamps alternativos después de adoptarlas.
La modificación de history no cambia schema ni filas de aplicación. Requiere ventana controlada,
backup íntegro de supabase_migrations.schema_migrations (incluidos statements) y revisión humana.
No borrar archivos históricos. No usar db reset remoto, db pull con aceptación de repair automático
ni db push --include-all para saltarse esta reconciliación.

## Comandos futuros — NO ejecutados

Antes: verificar proyecto, ausencia de drift nuevo, hashes 18/18 y backup recuperable del history,
snapshot/backup productivo, staging equivalente y ausencia de jobs/CI que desplieguen simultáneamente.
Validar la adopción del catálogo histórico con el responsable. Autenticarse por mecanismo seguro
de la CLI; no poner passwords en argumentos, scripts, Git o logs.

Desde un checkout revisado, con CLI 2.118.0 fijada y el target explícito:

```powershell
node node_modules/supabase/dist/supabase.js migration list --project-ref nwpdfqwqxrkokluqqqfs
node node_modules/supabase/dist/supabase.js migration repair 20260907203437 20260907203438 20260907205528 20260908093541 20260908094753 20260908103049 20260909000858 20260909234040 20260928160916 20260928162849 20260928162850 20260928210316 20260928232227 20260929000621 20260929000841 20260929001114 20260929001306 20260929122500 20260929130000 20260929131500 20260929133000 20260929144308 --status applied --project-ref nwpdfqwqxrkokluqqqfs
node node_modules/supabase/dist/supabase.js migration repair 20260908093949 20260908094715 20260908103456 20260909001422 20260909234523 20260928161630 20260928162830 20260928210655 20260928232220 20260929000708 20260929001006 20260929001144 20260929001227 20260929004131 20260929005101 20260929005232 20260929020225 20260929150203 --status reverted --project-ref nwpdfqwqxrkokluqqqfs
node node_modules/supabase/dist/supabase.js migration list --project-ref nwpdfqwqxrkokluqqqfs
node node_modules/supabase/dist/supabase.js db push --dry-run --skip-vault --project-ref nwpdfqwqxrkokluqqqfs
```

Detenerse si el listado/dry-run no muestra **exactamente** las tres migraciones pendientes de abajo.
Estos pasos NO son transaccionales en conjunto: no ejecutar otros despliegues entre ellos.
La operación inicial applied evita dejar versiones históricas sin ninguna entrada. Si algún repair
falla, detenerse y recuperar el history respaldado; no continuar con un push parcial o include-all.
`reverted` retira registros, no deshace SQL. Una recuperación debe restaurar el backup exacto,
no inventar un rollback de datos ni reconstruir statements desde hashes.

Solo después de aprobación independiente y staging:
`node node_modules/supabase/dist/supabase.js db push --skip-vault --project-ref nwpdfqwqxrkokluqqqfs`.
No se ejecutó ni el dry-run remoto en esta iteración.

## Cambios realmente pendientes

| Orden | Migración | Dependencias/precondiciones | Riesgo | Recuperación |
|---|---|---|---|---|
| 1 | 20260929204150_fix_minorista_checkout_lifecycle | Commerce, variantes y checkout minorista ya representados; staging con reservas/pagos/reintentos | Cambia 4 funciones y valida transiciones de pedido; comprobar estados actuales y clientes | Antes de commit SQL, transacción revierte. Después, migración compensatoria revisada; no reintroducir las carreras antiguas ni revertir pedidos/pagos automáticamente |
| 2 | 20260929214717_harden_default_privileges | Tablas/secuencias/funciones existentes; app usando BFF y service_role | Clientes que dependían de grants browser antiguos dejan de tener acceso; cambia defaults postgres | Conservar ACL previas; restaurar solo grants explícitos demostrados necesarios, con RLS. No reabrir PUBLIC EXECUTE o browser DML indiscriminadamente |
| 3 | 20261001003824_micorreo_logistics_snapshots | Ambas anteriores y backend compatible con fingerprints; rollout conjunto; re-cotizar carritos | Cotizaciones previas sin snapshot se rechazan. Pedidos previos quedan no_preparado, sin importación retroactiva. Nuevas tablas/RPC y triggers | Apagar el job y métodos externos; conservar snapshots/auditorías/pedidos. Forward fix preferible. Restaurar función anterior solo mediante procedimiento revisado; no borrar bultos/importaciones o history para fingir reversión |

No hay otras migraciones posteriores en esta rama. La CLI creó el timestamp UTC 20261001003824
durante el 30/09/2026 de Uruguay; no se inventó un timestamp a mano.

## Responsabilidad de plataforma

supabase/platform/harden-admin-defaults.sql sigue separado. Postgres conserva su hardening de aplicación.
No se elevó ningún rol ni se ejecutó el procedimiento remoto. Objetos futuros creados por supabase_admin
podrían recibir defaults más amplios: exigir grants/RLS explícitos y revisión de plataforma.
El test privilegiado en el clúster descartable no demuestra hardening del rol remoto.

Fuentes: [migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair),
[roles protegidos](https://supabase.com/docs/guides/database/postgres/roles-superuser).
Opciones cotejadas también con --help de la CLI instalada.
