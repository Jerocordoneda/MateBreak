# Rehearsal local de adopción — 01/10/2026

Continuación desde `d70277f`, con una migración administrativa nueva, sin
reescribir las 25 anteriores. CLI fijada y comprobada: 2.118.0. Resultado automático
actual: [baseline-rehearsal-result.json](schema-metadata/baseline-rehearsal-result.json).

## Resultado: PASS

| Paso | History local | Evidencia |
|---|---:|---|
| Preparación vacía hasta 20260929144308 | 22 canónicas | Metadatos iguales a referencia remota archivada; ACL legacy reproducidas solo localmente |
| Fixture de history observado | 18 alternativas | Nombres/versiones archivados; statements locales equivalentes por tokens |
| CLI repair real --local, applied 22 / reverted 18 | 22 canónicas | Cero DDL, esquema/OIDs/datos/xmin/secuencias/defaults sin cambios |
| Dry-run | 4 pendientes | Lifecycle, hardening, snapshots logísticos y administración |
| Fallo en hardening, statement 1 | 23 canónicas | Lifecycle confirmado; REVOKE parcial revertido; ninguna logística registrada |
| Recuperación hacia adelante | 26 canónicas | Dry-run solo las 3 restantes; retirado únicamente el fallo sintético |
| Reset desde cero | 26 canónicas | Esquema y defaults convergentes; hashes de migraciones iguales |

Las 47 tablas anteriores al repair preservaron conteos, hashes y versiones xmin;
también OIDs de relaciones/funciones/triggers y valores de secuencias. La adopción
no ejecutó bootstrap, catálogo ni reconciliaciones sobre objetos preexistentes.
El fixture usa catálogo histórico público archivado (106 productos/217 variantes)
y actores sintéticos; no copia filas productivas.

Estado final: 50 tablas, 341 columnas, 234 constraints, 111 índices, 46 funciones,
12 triggers, 9 policies y 4 secuencias. Se compararon propietarios, grants/RLS,
tipos/defaults y default privileges. Defaults protegidos de supabase_admin intactos;
su hardening de plataforma sigue pendiente.

El observador capturó 59 eventos DDL confirmados durante migraciones efectivas,
cero durante repair. Es transaccional: los eventos de la migración fallida se
revierten. El transcript conserva el error de statement 1 y las assertions prueban
que ACL/defaults/datos parciales no persistieron. El lote completo no es atómico:
lifecycle sí quedó confirmado. No se marcó applied la fallida ni se alteraron pagos.

## Validación final

`npm run test:baseline:local` PASS y luego `npm run test:full` PASS; se volvió a
probar SQL histórico 18/18, SQL logístico con recuperación administrativa, Node
144/144, stock 20/20, lifecycle 9/9, concurrencia minorista 2/2, permisos,
Auth/JWT/RLS A/B/anon con 11 RPC service-only y Storage. Checkout mock persisted
approved/rejected/pending, cinco casos comerciales de embalaje e importación
multi-bulto, sucursales ficticias y conciliación HTTP pasaron.

Advisors **locales** de seguridad WARN/ERROR: ninguna incidencia; npm audit
de dependencias de producción: 0 vulnerabilidades. Esto no certifica ajustes
actuales de Auth/Storage/red ni defaults protegidos del proyecto remoto.
El test:full reseteó los fixtures y detuvo Supabase y el PG descartable, conservando
volúmenes. Ver [RC y pendientes](release-candidate-validation.md).

## Evidencia y límites

- Resumen/transcripts/history/comparaciones: JSON enlazado arriba.
- Capturas completas/logs: `.baseline-rehearsal/`, fuera de Git.
- Logs finales junto al worktree: `rc-baseline-final.log`, `rc-full-final.log`,
  `rc-advisors-local.json`, `rc-audit.json`.
- Runbook: [procedimiento por fases](production-release-runbook.md).
- Configuración externa: [control de despliegues](release-candidate-blocker.md).

Deploy to production OFF fue confirmado manualmente por el usuario. Dashboard
no autenticado y conectores sin ese campo impidieron la verificación automática:
reconfirmar antes de publicar; volver a comprobar antes del merge. No hay autorización
de producción ni de merge. Ensayar el empaquetado del runbook en staging autorizado
y aprobar backup/restauración antes de cualquier rollout remoto.

Ninguna migration/history/dato productivo fue operado en esta tarea. Proveedores
reales permanecen inactivos. La edición original de .env.example se conserva fuera
del worktree aislado; sus valores no fueron trasladados ni publicados.
