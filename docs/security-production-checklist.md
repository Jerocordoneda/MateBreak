# Preparación de seguridad para producción

Estado 2026-09-30: **no habilitar pagos reales ni desplegar aún**. La [suite local](local-development.md) pasó desde una base reconstruida por archivos versionados. Ver [DDL, catálogo, drift y alcance de plataforma](schema-reconstruction.md). Esto no reemplaza staging con configuración real. Cada casilla requiere evidencia fechada y responsable.

Actualización 01/10/2026: [RC local](release-candidate-validation.md) PASS y
[rehearsal](baseline-rehearsal-validation.md) actualizado a 26 migraciones. El usuario
desactivó Deploy to production; no se pudo certificar automáticamente ese ajuste.
Reconfirmar OFF antes de publicación y de merge. Los resultados/avisos remotos de
abajo son antecedentes del 30/09, no una auditoría remota nueva.

## Antes del despliegue

- [ ] Revisar la adopción del retro-bootstrap/puente histórico en el historial de proyectos ya existentes. **No ejecutar esas migraciones sobre producción** ni forzar su inclusión: son replay para bases vacías. Staging nuevo puede reconstruirse; el historial del proyecto real necesita un plan de baseline separado.

- [ ] Ensayar en staging las cuatro pendientes, en orden: lifecycle, hardening de aplicación, snapshots logísticos y recuperación administrativa. Seguir el [runbook](production-release-runbook.md); ejecutar SQL/RLS A/B, lifecycle, stock, cancelación, idempotencia, logística y Advisor. **No fueron aplicadas remotamente en esta tarea.** Producción requiere backup, ventana y autorización separados.
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

## Evidencia disponible

- Node 80/80; SQL histórico 18/18; privilegios 1/1; stock concurrente 20/20; lifecycle minorista 9/9; concurrencia minorista 2/2, repetidos localmente el 30/09/2026.
- Dos resets desde cero; Auth/JWT/RLS A/B/anon, 7 RPC service-only, SECURITY DEFINER, Storage y checkout mock con reserva/pedido/pago locales: pasaron.
- Defaults del rol interno supabase_admin: separados con autorización del usuario; requieren operador de plataforma. No se otorgó ese rol a postgres. El test aislado del operador no implica aplicación en remoto.
- `npm audit --json`: 0 vulnerabilidades reportadas también en esta preparación. El resultado cambia con nuevas alertas.
- Supabase real: solo consultas READ ONLY de pg_catalog para DDL/metadatos en esta reconstrucción; ninguna fila de negocio, DDL/DML ni prueba destructiva remota.

## Respuesta a incidentes

1. Pausar checkout desde infraestructura y conservar request IDs/ventana temporal sin registrar credenciales.
2. Revocar o rotar la credencial afectada en el proveedor; actualizar secreto del hosting y reiniciar instancias.
3. Reconciliar pedidos, reservas y pagos por referencia externa; evitar cambios manuales sin registro.
4. Restaurar desde backup probado si hubo alteración de datos, verificar RLS/GRANTs y documentar causa/alcance.
5. Reabrir después de prueba en staging y aprobación operativa.

Referencias: [Supabase checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [Supabase Advisor](https://supabase.com/docs/guides/observability/advisors), [OWASP ASVS](https://owasp.org/projects/asvs).
