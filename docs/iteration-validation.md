# Validación de baseline y MiCorreo — 30/09/2026

Baseline main 15c9d64, rama local-supabase-validation; base de esta iteración 88eee2c.

| Área | Resultado |
|---|---|
| Node | 133/133, cero fallos/skips |
| MiCorreo | 53/53 nuevos, incluidos en Node; solo doubles/mocks |
| SQL histórico | 18/18, transacciones/rollback y fixtures sintéticas |
| SQL logístico nuevo | OK: fingerprint, variantes/cantidades/bultos, owner/expiry, snapshots inmutables, multi-bulto y finanzas |
| Privilegios | 1/1 en cluster privado descartable |
| Stock concurrente | 20/20 con bloqueo advisory realmente observado |
| Lifecycle minorista | 9/9 |
| Concurrencia minorista | 2/2: últimas unidades y reintento de la misma clave |
| Auth/RLS | JWT/email, login/logout, A/B, anon, private, 10 RPC backend-only |
| Storage | Lectura pública explícita; upload/list/delete restringidos |
| Checkout mock | Approved/reserva/pedido/pago/result/retry, rejected/liberación, pending |
| Job logístico local | Dos workers simultáneos, una importación del bulto pagado, sin reenvío; proveedor mock |
| Reset local | Al menos dos resets completos de las 25 migraciones finales: antes de suite y cleanup final |
| Advisors local security | Sin issues WARN/ERROR; CLI 2.118.0, --local --type security --level warn --fail-on error |
| History local | Las 25 versiones locales figuran aplicadas |
| Equivalencia remoto/local | 18/18 tokens SQL; metadatos remotos frescos idénticos a referencia original |
| Red | 54321–54324 publicados en todas las interfaces, accesibles desde Windows vía su propia IP Ethernet |
| Fin de ejecución | Supabase detenido, volúmenes preservados; Docker daemon funcionando |

La suite completa final terminó exit 0 y removió únicamente fixtures locales mediante reset.
Logs de ejecución en workspace fuera de Git: validation-micorreo-final.log y advisors-local.log.
No se copian sus datos a producción; no se publican credenciales.
El comparador offline de baseline y git diff --check también pasaron.

El repositorio original conserva main en 15c9d64. Se detectó un cambio local separado
de 1 línea en .env.example; se informó y se conservó, sin incluirlo en commits/push.
Los archivos original/worktree no comparten hardlinks. El .env original no se abrió ni modificó.

No se modificó production migration history. No se aplicaron migraciones a Supabase real.
No se hicieron pruebas destructivas remotas. No se usaron credenciales MiCorreo reales.
No se activó MiCorreo real ni Mercado Pago real. No se hizo merge a main.
Lecturas remotas: BEGIN READ ONLY, migration metadata/hashes y pg_catalog.

Revisión humana pendiente: [baseline y comandos futuros](baseline-adoption.md),
[MiCorreo y sus limitaciones](micorreo-architecture.md),
[riesgo de puertos](local-network.md), [diff clasificado](diff-classification.md).
