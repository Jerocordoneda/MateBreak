# Preparación de seguridad para producción

Estado 2026-09-29: **no habilitar pagos reales ni desplegar aún**. La revisión local no reemplaza pruebas contra un entorno de staging aislado con la configuración real. Cada casilla requiere evidencia fechada y responsable.

## Antes del despliegue

- [ ] Aplicar en staging la migración pendiente `20260929204150_fix_minorista_checkout_lifecycle.sql` y luego `20260929214717_harden_default_privileges.sql`; ejecutar tests SQL/RLS A/B, lifecycle, stock, cancelación, idempotencia y verificar Advisor. **No están aplicadas al Supabase real.** Repetir después en producción con backup, ventana y rollback acordados.
- [ ] **REQUIERE VERIFICACIÓN MANUAL:** Supabase Dashboard → Auth → Providers/Email y Security: confirmación de email, configuración de redirect URLs, política de contraseñas, MFA/AAL2 para administradores y protección de contraseñas filtradas. El Security Advisor reportó `auth_leaked_password_protection` WARN.
- [ ] **REQUIERE VERIFICACIÓN MANUAL:** Supabase Dashboard → Database → Roles/Policies, API exposed schemas, Network Restrictions, SSL, PITR/backups y prueba de restauración. Confirmar que `private` no esté expuesto y que la clave secret/service role nunca llegue al navegador.
- [ ] **REQUIERE VERIFICACIÓN MANUAL:** Supabase Dashboard → Storage → `product-images`: lectura pública deliberada, uploads no autorizados, MIME/tamaño, cuotas y limpieza de objetos; no usarlo para PII.
- [ ] Ejecutar `npm ci`, `npm test`, `npm audit --omit=dev` y tests SQL en DB descartable tras cada cambio. El escaneo heurístico de secretos del repo/historia no halló patrones conocidos, pero debe complementarse con GitHub secret scanning y revisión de commits antiguos.
- [ ] **REQUIERE VERIFICACIÓN MANUAL:** GitHub → Settings → Security/Actions/Branch protection: secret scanning/push protection, revisión obligatoria, checks requeridos y acceso mínimo. Rotar cualquier credencial que haya sido expuesta fuera de Git.
- [ ] **REQUIERE VERIFICACIÓN MANUAL:** Hosting → variables secretas separadas por entorno, TLS, origen HTTPS exacto, proxy conocido, HSTS, logs sin credenciales, alertas y limitador compartido en edge. No activar `trust proxy` con `true` genérico ni aceptar `X-Forwarded-For` de Internet.
- [ ] Sustituir inline scripts/estilos/CDN heredados y aplicar CSP estricta con tests de navegación; hoy la CSP solo cubre directivas seguras compatibles.
- [ ] Definir retención y acceso de logs de seguridad; correlacionar con request ID y alertar sobre RATE_LIMIT, ORIGIN_DENIED, fallos de webhook, pagos en revisión manual y errores de reserva. Los logs actuales son efímeros, no auditoría persistente.
- [ ] **REQUIERE VERIFICACIÓN MANUAL:** Mercado Pago → credenciales del entorno correcto, URL pública de webhook, firma secreta, permisos, notificaciones reales de prueba, reintentos, reembolsos y conciliación contable. No usar pagos reales en desarrollo.
- [ ] **REQUIERE VERIFICACIÓN MANUAL:** MiCorreo → credenciales y ambiente correctos, límites de API, tiempos de respuesta, cotizaciones, embalaje y cobertura. Probar en staging.
- [ ] Validar que el proceso de expiración de reservas corre una sola vez o es idempotente entre réplicas; probar recuperación ante caída entre reserva, creación de preferencia y webhook.
- [ ] Documentar runbook de incidentes y simulacro: revocar/rotar secret de Supabase, MP token y secreto webhook, MiCorreo, sesiones de admin; detener checkout y reconciliar pagos/reservas pendientes. Verificar backups/restauración antes de reabrir ventas.

## Evidencia de esta iteración

- Node: 77/77 (incluye headers, abuso por IP, origen de producción, cuerpos/IDs inválidos y firma de webhook).
- PostgreSQL local aislado: privilegios 1/1; stock concurrente 20/20; lifecycle minorista 9/9; concurrencia minorista 2/2.
- SQL histórico 18/18: **no ejecutado en esta iteración**. Requiere stack Supabase local completo; Docker no está disponible en esta máquina. El baseline `c2248fc` ya lo tenía validado, pero no se presenta como nueva prueba.
- `npm audit --json`: 0 vulnerabilidades reportadas en dependencias instaladas al momento de la revisión. El resultado cambia con nuevas alertas.
- Supabase real: únicamente consultas de catálogo SQL, migraciones y Advisor; ninguna DDL/DML ni test ofensivo.

## Respuesta a incidentes

1. Pausar checkout desde infraestructura y conservar request IDs/ventana temporal sin registrar credenciales.
2. Revocar o rotar la credencial afectada en el proveedor; actualizar secreto del hosting y reiniciar instancias.
3. Reconciliar pedidos, reservas y pagos por referencia externa; evitar cambios manuales sin registro.
4. Restaurar desde backup probado si hubo alteración de datos, verificar RLS/GRANTs y documentar causa/alcance.
5. Reabrir después de prueba en staging y aprobación operativa.

Referencias: [Supabase checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [Supabase Advisor](https://supabase.com/docs/guides/observability/advisors), [OWASP ASVS](https://owasp.org/projects/asvs).
