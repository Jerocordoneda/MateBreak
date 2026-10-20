# Correo transaccional — plan preparado, transporte real desactivado

Recomendación: Resend como primer proveedor por su SMTP compatible con Supabase y API con idempotencia/webhooks para outbox. Separar Auth de notificaciones de comercio; ambos reutilizan el dominio verificado y tienen credenciales independientes de mínimo alcance. Alternativa: proveedor SMTP/API equivalente con firma de eventos, supresión y deduplicación; el adaptador debe conservar el mismo contrato.

Supabase por defecto limita destinos a miembros del equipo y actualmente a dos mensajes por hora; no sirve para altas externas comerciales. Mantenerlo durante esta iteración y no sustituir confirmación por cuentas preconfirmadas ni otro mecanismo. [SMTP oficial de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Dominio, DNS y secretos

El responsable debe confirmar el dominio propio y acceso DNS; no se presume un dominio adquirido. Proponer subdominio `notificaciones.<dominio-propio>` y remitentes `cuentas@...` y `pedidos@...`, con Reply-To a casilla comercial atendida. Staging usa identidad/subdominio y claves separados de producción.

Agregar exclusivamente los valores generados por el proveedor: DKIM, SPF y MX de retorno/bounces donde corresponda. Revisar SPF existente para evitar dos registros SPF en un mismo nombre; no reemplazar los MX del correo humano. Añadir DMARC en `_dmarc` inicialmente p=none, observar informes y alinear remitentes antes de quarantine/reject. No inventar valores DNS. [Dominios verificados](https://resend.com/docs/dashboard/domains/introduction), [DMARC](https://resend.com/docs/dashboard/domains/dmarc).

Supabase SMTP: `smtp.resend.com`, puerto 465 con TLS o 587 STARTTLS, usuario `resend`, contraseña API key de envío restringida. Guardarla únicamente en configuración privada de Supabase, nunca en frontend, git ni logs. Revisar remitente, límites Auth, plantillas, Site URL y callbacks exactos; desactivar tracking de enlaces de Auth para conservar el retorno. [Configuración SMTP](https://resend.com/docs/send-with-smtp).

Backend: API key separada en secreto Render, dominio/remitente aprobados y secreto de webhook de eventos. Rotación y revocación documentadas. El frontend no recibe la clave. No se crearon credenciales ni se activó transporte.

## Dos recorridos

Registro/verificación: Supabase genera enlace PKCE/OTP, manda mediante SMTP y el callback existente persiste datos del perfil únicamente después de verificar la identidad. Probar alta, enlace vencido/usado, reenvío, retorno mayorista/general, navegador distinto y falta de perfil.

Recuperación: Supabase genera enlace de recuperación; implementar/verificar pantalla para nueva contraseña, respuesta neutra frente a enumeración, URL exacta permitida y sesión de recuperación validada. Probar token vencido/usado, cambio de contraseña y revocación de sesiones. La nueva pantalla/endpoint de recuperación completa aún es trabajo pendiente; no se presenta como implementada.

Compras/despacho: conservar outbox SQL de eventos únicos. Confirmación depende de pago confirmado autoritativo; despacho depende de transición logística confirmada. Snapshot de destinatario y plantilla versionada; vínculo privado con capability, nunca JWT de Auth en mensaje. WhatsApp continúa siendo apertura manual del mensaje MAY.

## Implementación segura del outbox

`server/email/worker.mjs` ya reclama eventos durablemente y diferencia retry/review, pero acepta exclusivamente adaptador mock. Preparar adaptador API real con idempotencyKey=ID del evento, payload estable, timeout, backoff acotado, dead-letter/revisión y métricas sin PII. Resend retiene claves 24 h: mantener ledger interno permanente y no reenviar a ciegas fuera de esa ventana. [Idempotencia oficial](https://resend.com/docs/dashboard/emails/idempotency-keys).

Una respuesta de aceptación no equivale a entrega. Registrar ID del proveedor y webhook firmado de delivered/bounced/complained; deduplicar eventos y respetar supresión. Antes de aceptación, errores seguros pueden reintentarse; aceptación incierta queda en revisión/conciliación, sin reintento destructivo. Claims vencidos deben recuperarse con exclusión mutua y evidencia del envío previo. Integrar worker supervisado, alertas por backlog y botón de revisión auditado.

Sin credenciales podemos terminar adaptador con proveedor fake, firmas/duplicados, plantillas escapadas, clasificación de errores, crash después de aceptación y replay pasado 24 h. Con autorización independiente: DNS verificado, secret provisioning, SMTP Staging y envíos a destinatarios de prueba aprobados; luego medir Gmail/Outlook, rebotes y latencias antes de producción.

## Costos consultados el 4 de octubre de 2026

| Plan Resend transaccional | Precio publicado USD/mes | Capacidad |
| --- | --- | --- |
| Free | 0 | 3.000/mes, máximo 100/día |
| Pro inicial | 20 | 50.000/mes; exceso 0,90 por 1.000 si se habilita |

Fuente primaria: [precios Resend](https://resend.com/pricing) y su representación oficial `/pricing.md`, guardada en evidencia local. Impuestos, dominio y hosting/worker no están incluidos; no se contrató ningún plan. Estimación inicial: Free para piloto pequeño con presupuesto diario monitorizado; Pro al superar 100 eventos diarios o necesitar margen operacional. Contabilizar altas, recuperaciones, confirmaciones, despachos y reenvíos juntos; no mezclar con campañas.
