# Release Candidate local — 01/10/2026

Base de esta continuación: `d70277f`; rama `local-supabase-validation`.
Main de referencia y remoto comprobado: `15c9d64`. Trabajo en worktree aislado;
la edición de `.env.example` del checkout original permanece intacta.

## Comportamiento implementado

- `/interno/logistica`: listado filtrado/paginado de bultos, referencias externas,
  estado independiente de pedido/pago, intentos y errores sanitizados. Historial
  de acciones administrativas. HTML/assets/API exigen identidad verificada y rol
  administrador obtenido de DB, sin privilegios por user_metadata.
- Conciliación con `mb_logistics_admin`: existencia oficial comprobada + createdAt
  permite registrar importado; ausencia oficial comprobada permite retry con el
  mismo extOrderId y contador; incertidumbre mantiene revisión. Requiere referencia
  de portal/soporte sin secretos. No hay API de búsqueda inventada ni importación
  desde el panel. Auditoría privada append-only con actor e idempotencia.
- Estado/claim/intentos esperados y lock por pedido protegen acciones concurrentes;
  claims activos se rechazan, abandonados solo pueden cerrarse en revisión.
  Límite total de 3 intentos. Solo rechazo explícito HTTP 429 admite retry automático;
  timeout/5xx/duplicado/resultado incompleto requieren revisión.
- Finalizaciones simultáneas de varios bultos actualizan correctamente el estado
  agregado. Ninguna conciliación modifica pedido, pago, stock o snapshot.
- Sucursales: `MATEBREAK_LOCAL_PICKUP_MOCK=1`, OFF por defecto, exige LOCAL_ONLY,
  API Supabase/origen loopback y ambos proveedores mock. Lista agencias ficticias,
  revalida código/provincia/CP y conserva la sucursal en el snapshot. Producción
  rechaza el selector y no consulta agencies reales. En modo persistido también
  requiere que el método esté activo en la DB local; el fixture lo prepara y limpia.
- Variable canónica `CORREO_MICORREO_ENVIRONMENT` con alias legacy
  `CORREO_ENVIRONMENT`; contradicción/valor inválido detiene el inicio. Configuración
  backend, sin credenciales/identificadores reales en ejemplos, frontend o Git.

## Validación ejecutada

| Verificación | Resultado |
|---|---|
| `npm run test:full` | PASS, incluida limpieza/reset/stop |
| Node | 144/144 |
| SQL histórico | 18/18, fixtures sintéticos con rollback |
| SQL logístico | PASS: fingerprint, propietario, vencimiento, snapshot inmutable, claims/pago, recuperación/admin/auditoría/límites |
| Privilegios aislados | PASS |
| Stock concurrente | 20/20 |
| Lifecycle | 9/9 |
| Concurrencia minorista | 2/2 |
| Auth/JWT/RLS/Storage | PASS A/B/anon, private, 11 RPC service-only y operaciones Storage autorizadas/rechazadas |
| Checkout mock persistido | Approved/rejected/pending, reservas, pertenencia e idempotencia PASS |
| Recuperación HTTP | PASS: rol DB/spoof, cuarentena, ausencia comprobada, misma referencia, idempotencia concurrente, existencia comprobada, conflictos y aislamiento financiero |
| Sucursal local/mock | PASS hasta pedido pagado e importación mock por agencia |
| Rehearsal con CLI 2.118.0 | PASS: history 18 → 22 → fallo parcial 23 → recuperación 26; reset convergente |
| Equivalencias archivadas | 18/18; generador 106 productos/217 variantes, --check PASS |
| Advisors locales security WARN/ERROR | 0 incidencias |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| UI privada | Inspección en navegador con fixture sin DB/proveedores; campos/evidencia visibles según acción y HTML/assets protegidos por tests |

Los cinco casos recorrieron carrito → cotización → snapshot → reserva/pedido
pagado mock → workers concurrentes → agregado importado, sin reenviar bultos:

| Caso | Embalaje esperado (cm / gramos) |
|---|---|
| 1 mate | 17 × 17 × 17 / 550 |
| 2 mates | 34 × 17 × 17 / 1100 |
| 1 set | 30 × 30 × 20 / 1300 |
| 2 sets | 30 × 30 × 20 / 2600 |
| 3 sets | 2 bultos: 30 × 30 × 20 / 2600 y 30 × 30 × 20 / 1300 |

Son estimaciones operativas, pendientes de medición física; tarifas de estos
tests son ficticias. Cada bulto conserva su referencia y valor declarado del
snapshot del backend, no dimensiones/precios enviados por el navegador.

## Historial y evidencia

Se agregó `20261001112820_logistics_admin_recovery.sql` mediante CLI; las 25
migraciones existentes no se reescribieron. El rehearsal volvió a verificar hashes,
OIDs, datos/xmin/secuencias/defaults y ausencia de DDL durante repair local.
Resultado automático: `schema-metadata/baseline-rehearsal-result.json`.
Capturas completas: `.baseline-rehearsal/`, ignoradas por Git. Logs de esta ejecución
están junto al worktree (`rc-full-final.log`, `rc-baseline-final.log`,
`rc-advisors-local.json`, `rc-audit.json`), sin imprimir claves locales.
El stack Supabase y el PG descartable quedaron detenidos; los volúmenes se conservan.

## Pendientes que bloquean merge/rollout

1. Reconfirmar Deploy to production OFF antes de publicar: Dashboard no autenticado
   y conectores sin ese campo impidieron la verificación automática. Comprobarlo
   nuevamente antes del merge; no pulsar Deploy/Retry/Reset ni habilitar automatismos.
2. Revisión humana del PR/commit final y sus checks. No hacer merge en esta tarea.
3. Ensayar el artefacto del [runbook por fases](production-release-runbook.md) en
   staging autorizado independiente con fixtures, backup/PITR/restauración comprobados
   y responsable de ventana. No trasladar resets o fixtures a producción.
4. Revisar Auth/URLs/MFA/contraseñas filtradas, API/Storage/red y secretos de hosting;
   no se inspeccionaron otra vez esos ajustes remotos. Hardening de defaults
   protegidos de supabase_admin sigue siendo una operación separada de plataforma.
5. Credenciales API oficiales de MiCorreo, medidas físicas y prueba oficial del
   contrato servicio/importación; Mercado Pago requiere su validación de webhook y
   conciliación. Worker real sin scheduler; activación futura necesita implementación
   y autorización explícitas, no basta un cambio de variable.

No se hicieron operaciones sobre producción/history remoto ni se activaron
proveedores reales. La autorización de publicar la rama y crear PR conserva la
prohibición de merge y de migraciones remotas.
