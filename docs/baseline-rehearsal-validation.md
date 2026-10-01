# Rehearsal local de adopción — resultado del 30/09/2026

Base: `ca8150bfd76beffcc705e68969e6957f02128c46` más informe local de bloqueo
`789d231595eca2aad7667cd4bfc883f08eceb516`. CLI fijada y comprobada: 2.118.0.
Todos los SQL de aplicación conservan su SHA256 durante el ensayo.

## Resultado automático: PASS

| Paso | History local | Evidencia |
|---|---:|---|
| Preparación vacía hasta 20260929144308 | 22 canónicas | Esquema capturado igual a referencia remota previa a pendientes; ACL legacy reproducidas solo localmente |
| Fixture de history observado | 18 alternativas | Versiones/nombres capturados; statements de SQL local equivalentes por tokens, sin recuperar bytes remotos |
| Repair real de CLI, applied 22 / reverted 18 | 22 canónicas | Ninguna migración histórica ejecutada; cero eventos DDL, esquema/OIDs/datos/xmin/secuencias/defaults sin cambios |
| Fallo inyectado en hardening | 23 canónicas | Lifecycle confirmado; error en statement 1 de revocación de secuencias; REVOKE previo de tablas revertido; logística ausente |
| Recuperación hacia adelante | 25 canónicas | Dry-run solo hardening/logística; retiro únicamente de fallo sintético y push local de pendientes |
| Reset desde cero | 25 canónicas | Convergencia de esquema y default privileges, sin diferencias lógicas |

El catálogo público archivado de 106 productos/217 variantes se usó exclusivamente
para construir el fixture local. Las 47 tablas anteriores al repair conservaron
conteos y hashes de contenido y versiones xmin; no se copiaron filas productivas.
OIDs de relaciones/funciones/triggers y valores de secuencias permanecieron iguales.
La adopción no ejecutó bootstrap, catálogo ni reconciliaciones históricas contra
objetos preexistentes. Los resets sí ejecutan esos archivos sobre la base vacía,
como corresponde: no confundir preparación/validación con repair.

Estado final convergente: 49 tablas, 327 columnas con sus tipos/defaults, 229
constraints, 109 índices, 43 funciones, 11 triggers, 9 policies y 4 secuencias.
También se compararon propietarios, grants/RLS y defaults. Los defaults protegidos
de supabase_admin permanecieron intactos y su hardening de plataforma sigue pendiente.

El observador registró 47 eventos DDL confirmados durante las migraciones efectivas,
y cero durante repair. La auditoría del event trigger es transaccional: los eventos
de la migración fallida se revierten. El transcript de CLI conserva el statement
fallido y las assertions comprueban que sus ACL/defaults/datos no persistieron.
No se supone un rollback de todo el lote: lifecycle quedó aplicado cuando falló
hardening. La recuperación no marcó la fallida applied ni alteró estados financieros.

El primer intento de inyección era demasiado amplio y alcanzó un REVOKE de
lifecycle. Fue un fallo del fixture de prueba, no del SQL de aplicación; se conservó
en `.baseline-rehearsal/attempt-1/`. Se restringió la inyección a las secuencias del
hardening y el ensayo completo pasó; una ejecución final agregó controles de
versiones xmin, secuencias, CLI/hashes actuales y observador activo, y volvió a pasar.

## Validación posterior

| Validación | Resultado |
|---|---|
| Node | 137/137, incluidos 53 MiCorreo y 4 guardrails nuevos |
| Equivalencias SQL capturadas | 18/18 |
| Generador histórico | 106 productos, 217 variantes; --check OK |
| SQL histórico | 18/18 |
| SQL logístico | Fingerprint/ownership/expiry/inmutabilidad/multi-bulto/claims/aislamiento financiero OK |
| Privilegios | security-privileges OK |
| Stock concurrente | 20/20 |
| Lifecycle | 9/9 |
| Concurrencia minorista | 2/2 |
| Auth/JWT/RLS/RPC | A/B/anon, private y 10 RPC service-only OK |
| Storage | Lectura pública deliberada, escritura/listado/borrado restringidos OK |
| Checkout mock persistido | Approved/rejected/pending y reservas/reintentos OK |
| Job logístico mock | Claims concurrentes, una importación, sin reenvío/alteración financiera OK |
| Audit dependencias de producción | 0 vulnerabilidades |
| Limpieza | Reset de fixtures, contenedor PG descartable detenido y Supabase detenido |
| Puertos 54321–54324 | Sin listeners al finalizar |

No se modificó SQL de aplicación ni se repitió la auditoría remota. No se volvieron
a ejecutar Advisors remotos/locales: el estado de seguridad ya cerrado permanece
como antecedente, no se presenta aquí como un nuevo resultado de Advisor.
Los comandos offline añadidos a CI se probaron localmente; este commit no se
publicó y no hay ejecución nueva de GitHub Actions que declarar verde.

## Evidencia y siguiente límite

- Resumen, comandos/transcripts, histories y comparaciones:
  `docs/schema-metadata/baseline-rehearsal-result.json`.
- Capturas completas (esquemas, OIDs, datos agregados, DDL y logs):
  `.baseline-rehearsal/`, fuera de Git para evitar duplicar grandes snapshots.
- Procedimiento futuro: [runbook](production-release-runbook.md).
- Variables/secretos: [inventario](production-secrets.md).
- Automatización confirmada: [bloqueo](release-candidate-blocker.md).

**No hay autorización de producción ni de merge.** El usuario confirmó Deploy to
production ON para main, sin cambiarlo. Antes de publicar/reparar history remoto,
el responsable debe deshabilitarlo explícitamente y comprobar que quedó guardado.
El empaquetado por fases del runbook requiere dry-run/validación adicional en
staging autorizado: no se simuló un proveedor/hosting productivo.
La RC funcional original aún tiene pendientes (panel/acciones logísticas,
sucursales mock y pruebas ampliadas de todos los casos comerciales); este resultado
completa el rehearsal y el procedimiento solicitados, no certifica toda la RC.

Confirmaciones: producción e history remoto sin cambios; ninguna migration remota;
sin credenciales reales de aplicación/proveedores en pruebas; ningún proveedor
real activado; sin push/PR/merge. El .env.example original conserva su modificación
de customerId y main permanece en 15c9d64.
