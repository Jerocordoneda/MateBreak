# Revisión de seguridad preproducción — 4 de octubre de 2026

Revisión de código, dependencias, ensayos SQL con roles reales y Chrome local. No constituye una auditoría exhaustiva ni una prueba de penetración de Cloud. No se explotaron cuentas reales. Los controles comprobados y los riesgos pendientes se distinguen a continuación.

## Hallazgos y plan

| Prioridad | Hallazgo y evidencia | Corrección y aceptación antes de producción |
| --- | --- | --- |
| Alta | Rutas de cuenta/administración usan `getUser` y roles SQL, pero no la comprobación de sesión viva utilizada por `server/wholesale/access.mjs`. Un JWT copiado puede seguir siendo válido tras logout hasta su expiración; riesgo especialmente sensible para acciones administrativas. | Extender guardia de sesión viva a operaciones sensibles, probar token copiado tras logout/revocación, cambios de rol y sesiones vencidas. Revisar también acceso directo por Data API; MFA para administradores. No se afirma una escalada de roles observada. |
| Alta | `server/payments/routes.mjs` reconoce approved/rejected/cancelled; refunded/charged_back quedan como pendiente en auditoría sin conciliación comercial específica. | Estados y cola de revisión para devoluciones/contracargos, conciliación periódica, alertas y compensaciones explícitas. No devolver automáticamente stock de mercadería despachada. Probar eventos tardíos, duplicados y fuera de orden. |
| Media | `server/security.mjs`: cuotas en memoria por `socket.remoteAddress`; reinicios/replicas no comparten estado y un proxy puede agrupar compradores legítimos. | Limitador distribuido/edge; configurar únicamente proxies confiables; quotas por IP y cuenta, tests de spoofing, carga y recuperación. Nunca confiar indiscriminadamente en X-Forwarded-For. |
| Media | CSP pública restringe base/frame/object/form pero no script-src/default-src. Inicio usa recursos externos. UI privada tiene política más restrictiva. | Empaquetar dependencias y recursos necesarios, eliminar scripts inline o usar hashes/nonces; desplegar primero report-only y verificar todas las páginas antes de enforcement. No se detectó una inyección explotable en esta iteración. |
| Media | Supabase Advisor informa protección de contraseñas filtradas desactivada. | Habilitar tras validar disponibilidad del plan y política de contraseñas; prueba de rechazo con contraseña conocida de prueba, sin filtrar credenciales en logs. |
| Media | No hay política operativa completa de retención/exportación/eliminación de PII de perfiles, direcciones, snapshots y eventos. | Inventario de datos y acceso, plazos aprobados por responsable, auditoría de exportación, borrado compatible con historial comercial y backups. No ejecutar purgas históricas como reparación. |
| Media | Expiración de reservas arranca en `server/index.mjs` y cada 60 s dentro del proceso; Render Free puede suspenderse. Jobs logísticos/outbox requieren ejecución operacional durable. | Scheduler/worker persistente y monitoreo de atraso; pruebas de reinicio, concurrencia y tareas abandonadas; alertas por reservas/jobs/outbox atascados. |
| Media | Pago externo no valida explícitamente collector/live_mode esperado; la firma usa ventana temporal acotada. | Validar entorno/comerciante con fixtures y homologación; revisar contrato vigente de reintentos firmados; conciliación independiente de webhook. Son brechas de preparación, no prueba de pago fraudulento. |

La validez residual de JWT y la comprobación de `session_id` están documentadas en [Supabase Sessions](https://supabase.com/docs/guides/auth/sessions). El aviso de contraseñas tiene [remediación oficial](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Controles comprobados

- La identidad mayorista procede de `getUser`, sesión viva SQL y cuenta validada; metadata de Auth se usa solo para datos de presentación. `mb_rol` consulta asignaciones internas, sin aceptar rol del registro.
- Solicitudes propias por account_id; ID ajeno responde 404. ACL privadas, propiedad inmutable, aislamiento A/B, expiración/revocación y replay concurrente ensayados en SQL. El perfil nuevo usa `auth.uid()`, SECURITY INVOKER y RLS; no recibe usuario objetivo.
- La migración nueva completa campos vacíos de forma atómica y preserva los existentes. Valida catálogo de provincias, WhatsApp como texto, longitudes y claves; rechaza identificadores/roles externos. UI no guarda PII en local/session storage; el logout limpia formularios y listas.
- Precios y cantidades autoritativos del servidor; 66 límites de tramos ensayados. SQL bloquea reservas/stock y prueba concurrencia sin sobreventa; el retorno del navegador nunca confirma un pago.
- Webhook usa HMAC y consulta autenticada al proveedor; valida referencia, importe y moneda, persiste auditoría e idempotencia. Falta la ampliación de estados indicada arriba.
- JSON limitado a 16 KB, mutaciones con Origin exacto, cookies HttpOnly/Secure/SameSite en HTTPS, headers y no-store. Retornos Auth pertenecen a una lista interna; no se admiten URLs externas.
- Backend/secrets/SQL quedan fuera del artefacto público seleccionado. `npm audit --omit=dev --audit-level=high`: cero vulnerabilidades notificadas; no equivale a ausencia de defectos propios.

Supabase Advisor remoto: 52 INFO `rls_enabled_no_policy` y un WARN de contraseñas. Las tablas sin políticas corresponden al diseño de acceso por RPC/servicio; RLS sin políticas deniega acceso ordinario. No agregar políticas abiertas para silenciarlo. Mantener ensayo de grants y rutas; [explicación del linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Orden de estabilización

Resolver primero sesiones sensibles y estados financieros; después limitador/worker/conciliación, correo propio y CSP. Repetir pruebas negativas, ACL/RLS y CI del candidato resultante. Ejecutar piloto comercial solo con autorización, cuentas y medios de prueba. Este candidato permite revisión en Staging mock; no habilita todavía lanzamiento comercial.
