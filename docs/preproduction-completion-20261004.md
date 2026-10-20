# Cierre local de preproducción — 4/10/2026

Continúa `d660f14`; reemplaza únicamente el estado de pendientes descrito en el informe de esa fase. No autoriza publicación, SMTP, DNS, proveedores ni tareas automáticas. Staging sigue en `2230767`, con 32 migraciones; el candidato tiene 37. Los informes A–D y las capturas se entregan fuera de Git.

## Registro y Auth

El diagnóstico real de Staging encontró una condición `register && wholesale` en `account.js`: el registro general conservaba email/contraseña y el mayorista mostraba los campos nuevos. El alias y los 165 hashes publicados eran correctos. El candidato usa una sola captura de nombre, apellido, email, contraseña, teléfono/WhatsApp, provincia canónica (23 + CABA), localidad y empresa opcional. El parámetro `volver` controla solamente el destino interno. No pide CUIT ni dirección. Frontend y backend validan los datos; metadata no otorga permisos.

La persistencia después de confirmar/iniciar sesión utiliza la función de la migración 32: completa campos vacíos con RLS, preserva los existentes y permite completar perfiles anteriores. La solicitud mayorista toma los datos de la cuenta y permite editarlos sin enviar una solicitud durante las pruebas de navegador. Logout limpia datos privados, formularios y caché de navegación.

`AUTH_RECOVERY_ENABLED=0` por defecto. La UI y `/api/auth/recover`, `/auth/recuperar`, `/api/auth/recovery-status` y cambio de contraseña están conectados. El callback exige PKCE de tipo recovery, usuario confirmado y sesión viva; una prueba HttpOnly de diez minutos está ligada a esa sesión. Un callback de signup no habilita cambio de contraseña. El resultado público de solicitar recuperación es genérico. Al cambiar se revocan sesiones. La prueba real aislada usa Supabase Auth/PostgREST y Mailpit; no evade el SMTP de Cloud. Antes de activación futura, agregar exclusivamente `https://<origen-aprobado>/auth/recuperar` a Auth, preservando los callbacks aprobados. Nunca wildcard.

## Seguridad implementada

`getUser` verifica identidad; `session_id` únicamente localiza la sesión en Auth SQL. No se confía en `getSession` para identificar al usuario. Las operaciones sensibles de servicio pasan por una lista cerrada de RPC y bloquean la sesión dentro de la misma transacción. Actor y sesión deben coincidir con los verificados. Roles y propiedad siguen en las funciones originales. Siete políticas RLS restrictivas comprueban sesión viva; escrituras bloquean su fila y serializan la revocación. GET/HEAD de PostgREST son de solo lectura y comprueban la sesión en el snapshot del statement. No se concede UPDATE de `auth.sessions` al servicio.

El esquema privado concede USAGE a authenticated exclusivamente para ejecutar el helper RLS sin parámetros; esto no concede SELECT de tablas privadas. Dos helpers privados son SECURITY DEFINER con search_path vacío y ACL explícita; las RPC públicas nuevas son INVOKER. Los ensayos comparan todos los deltas, grants, constraints y funciones, conservando los 26 hashes originales.

`RATE_LIMIT_KEY` permite cuotas distribuidas mediante UPSERT SQL atómico (IP y cuenta, claves HMAC sin PII). Producción lo exige; una caída del almacén falla cerrada. Staging aún utiliza su configuración publicada. `TRUSTED_PROXY_ADDRESSES` admite únicamente IP/CIDR explícitos; decidir y verificar los proxies reales antes de activar. Limpieza manual `mb_security_rate_cleanup()` borra solamente buckets expirados, nunca datos comerciales.

La CSP pública local aplica default/script/connect self; Tailwind se compila durante build y los scripts ejecutables están en archivos locales. No queda el compilador CDN. Se conservan cookies, no-store, orígenes exactos y límite de JSON. El webhook de recibos usa bytes raw y firma, separado de CSRF de navegador. Los logs de seguridad contienen tipo, ruta, estado e ID de petición, sin tokens, cuerpos ni destinatarios.

## Operación manual y correo

`node --env-file-if-exists=.env server/manual-worker.mjs email-once|payment-once|payment-scan|status` es una invocación acotada, sin scheduler ni bucle comercial. Flags de transporte, worker, recibos y conciliación están apagados por defecto. El endpoint de recibos es `/api/emails/resend/recibos`, exige opt-in y secreto Svix, límite raw y verificación antes de dedupe/persistencia. Acknowledgement significa aceptación; no significa entrega.

El outbox real exige `EMAIL_TEST_EVENT_ID` o `EMAIL_ROLLOUT_AFTER`. La migración 36 deja `created_at` NULL en eventos históricos: no pueden entrar accidentalmente mediante el cutoff. Seleccionar un evento histórico requiere su ID deliberado. No se borra ni vacía el outbox. Confirmaciones recibidas aún sin intento pueden quedar `superseded` si el pago ya fue aprobado y existe su evento de pago; se conserva la fila/auditoría. Claims abandonados de correo pasan a revisión; nunca se supone que un envío ambiguo no ocurrió. El envelope AES-GCM y capacidad privada son inmutables. La ventana máxima de reintento es 23 h dentro de la idempotencia de Resend de 24 h; timeout, 5xx, 409 o respuesta incompleta requieren revisión. Solo rechazos explícitos recuperables permiten reintento acotado.

La cola de conciliación utiliza IDs de pago conocidos, SKIP LOCKED, backoff y revisión después del límite. El webhook encola antes de consultar al proveedor. `payment-scan` prepara una selección acotada desde pagos reales conocidos; no crea preferencias ni cobros. La consulta GET puede repetirse con seguridad; no hace refunds ni repone stock. `status` entrega contadores sin PII y alerta por pendientes de correo o pagos >100, antigüedad >1 h, revisión, holds financieros o recibos bounced/complained/failed. Los recibos negativos son contadores históricos; el operador debe revisar su resolución, sin purga automática. Hace falta un operador/scheduler y canal de alertas aprobado para ejecución persistente externa.

## Resend y DonWeb: procedimiento pendiente

Remitente previsto: `MateBreak <pedidos@matebreak.com.ar>`. Reply-To y único destinatario del piloto: `Mate.break32@gmail.com`. No usar Gmail como identidad From de Resend. Preparados `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, `EMAIL_TEST_RECIPIENT`, API key, secreto de recibos y clave de cifrado. El runtime limita el destinatario de pruebas al Gmail indicado.

El dominio sigue delegado a `ns1.donweb.com` / `ns2.donweb.com`; sin acceso administrativo. Tiendanube sigue siendo la web comercial. No se necesita `staging.matebreak.com.ar` para esta iteración.

1. Obtener acceso a DonWeb y exportar la zona completa antes de cambios.
2. En la cuenta del titular, crear/verificar en Resend el dominio aprobado y obtener sus registros exactos para la región elegida. No hay valores calculables antes de ese paso.
3. Registrar por cada fila tipo, nombre, valor, prioridad y TTL **exactos de Resend**; comprobar colisiones contra la exportación. Conservar @/www/Tiendanube, MX del correo actual, SPF y DKIM existentes. Si hay colisión, detenerse y diseñar el ajuste con el responsable; no reemplazar automáticamente.
4. Agregar solamente los registros aprobados, sin proxy. Consultar ambos NS y verificar Resend. Una modificación DMARC/SPF existente requiere revisión de todos los emisores. El CNAME de Staging es una decisión separada y no se presume un valor.
5. Configurar secretos únicamente en backend/worker o Supabase Auth. SMTP de Auth y plantillas se cargan después de autorización; conservar ConfirmationURL y desactivar tracking de enlaces Auth. Validar headers SPF/DKIM/DMARC mediante piloto autorizado.
6. Para UN correo real futuro: evento sintético identificado previamente y único, destinatario fijado al Gmail, flag habilitado solo para invocación manual `email-once`, ID explícito, cero consumo del backlog. Revisar acknowledgement y recibo. Si resultado ambiguo, parar y consultar proveedor; no repetir ni generar otra clave. Apagar flags al terminar.

## Backup, retención y lanzamiento

Antes de migrar: respaldar DB y ledger de migraciones, baseline de hashes comerciales, configuración Auth/rutas/proveedores, artefactos y claves de cifrado con acceso restringido. Ensayar restauración únicamente en un proyecto aislado, verificando roles/grants/funciones, conteos/hashes y descifrado; nunca contra Cloud existente como prueba. Retener respaldos cifrados, acceso por mínimo privilegio y responsable identificado. No hay restauración ni reparación automática.

Inventario privado: perfiles/direcciones, snapshots de pedido/cotización, solicitudes y eventos, capabilities hash, envelopes cifrados, auditoría financiera, recibos mínimos y buckets HMAC. Solo estos últimos tienen TTL operativo implementado. Plazos comerciales/fiscales, derecho de exportación/borrado y rotación versionada de cifrado requieren decisión del titular; no se implementó una purga que pueda destruir historial. No confundir cifrado con una política de retención.

Bloqueos externos: acceso DNS; credenciales y permiso Resend/SMTP; callbacks exactos; MFA de administradores y protección de contraseñas filtradas según plan Supabase; contratos/homologación MP y MiCorreo (etiquetas/tracking aún requieren contrato oficial); proxies/worker/alertas y política de datos aprobados. No declarar listo para producción.

Para una publicación futura: nuevo preflight remoto de solo lectura; comprobar baseline, backup y replay; push únicamente a la rama autorizada; CI SUCCESS del HEAD exacto; aplicar solamente migraciones nuevas autorizadas en orden; publicar backend compatible minimizando ventana; publicar prebuilt auditado en el proyecto autorizado; revisar aliases y Live/Ready; validar sin escrituras comerciales. Si falla, detenerse. Rollback de frontend/backend solo cuando su compatibilidad con el esquema esté probada; no borrar nuevas migraciones ni hacer down/restauración automática. Piloto y activación comercial son otra autorización.
