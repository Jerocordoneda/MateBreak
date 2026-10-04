# Credenciales y homologación comercial — candidato local, 4/10/2026

Esta guía no habilita servicios. No pegar secretos en chats, Git, `.env.example`, Vercel público o capturas. Obtenerlos en las cuentas del titular y cargarlos, tras autorización de la activación, en el gestor de secretos del backend/worker o en Supabase Auth para SMTP. Mantener Staging actual en mock. `.env.example` contiene solamente nombres vacíos; el runtime rechaza credenciales comerciales en Staging.

## Mercado Pago Checkout Pro

| Dato que debe aportar el titular | Configuración preparada | Uso |
| --- | --- | --- |
| Aplicación Checkout Pro de Argentina y vendedor titular | Identificador de aplicación en la ficha de homologación, sin colocarlo en el navegador | Confirmar propiedad del contrato, AR/ARS y cuenta receptora |
| Access Token de la cuenta vendedora de prueba para Checkout Pro; posteriormente otro del titular real | `MP_ACCESS_TOKEN`, solo backend | Authorization Bearer de preferencias y consulta de pagos |
| ID numérico del vendedor receptor de esa misma cuenta | `MP_COLLECTOR_ID` | Rechazar pagos de otra cuenta aunque importe/referencia coincidan |
| Secreto de firma de Webhooks de la aplicación correspondiente | `MERCADOPAGO_WEBHOOK_SECRET`, solo backend | HMAC `x-signature`, `x-request-id` y `data.id` |
| Contrato de prueba o comercial elegido | `MP_ENVIRONMENT=test` o `production` | Etiqueta persistida del contrato; no cambia el host de la API |
| Valor booleano esperado de `live_mode` para ese contrato, verificado durante homologación autorizada | `MP_EXPECTED_LIVE_MODE=true` o `false`, obligatorio para habilitar | No inferirlo del prefijo del token o del enlace de Checkout Pro |
| Origen público HTTPS definitivo | `APP_ORIGIN`, origen sin path | Tres retornos internos y notificación `/api/pagos/mercadopago/webhook` |
| Public Key, si se decide incorporar SDK/Bricks en el futuro | `MP_PUBLIC_KEY`, hoy sin uso | El flujo actual redirige desde backend y no necesita esta clave |

Checkout Pro utiliza `POST https://api.mercadopago.com/checkout/preferences` e **`init_point` también para usuarios de prueba**. No usar `sandbox_init_point`; las credenciales/cuenta de prueba distinguen el ensayo. El código limita el retorno del proveedor a HTTPS `www.mercadopago.com.ar` y exige vendedor y booleano de contrato para conciliar. Ver [referencia actual de preferencias](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro-preferences/create-preference/post) y [guía oficial actual de integración](https://github.com/mercadopago/mercadopago-claude-marketplace/blob/main/plugins/mercadopago/skills/mp-integrate/SKILL.md).

No se crearon usuarios de prueba ni preferencias en Mercado Pago. Obtener cuentas vendedor/comprador de prueba separadas y medios oficiales de prueba para el piloto autorizado. Nunca probar cobros con datos bancarios reales por comodidad. Activar `PAYMENTS_MODE=real` sería un cambio posterior independiente, que necesita las dos migraciones locales y la homologación; no alcanza con pegar una clave.

La creación ya usa una fila única `mercadopago_intento` por pedido: una sola operación gana y los demás reutilizan el resultado persistido. El header de idempotencia es defensa adicional; **no se presupone que Preferences garantiza por sí sola deduplicación de POST**. Una respuesta perdida conserva el intento fallido para revisión y no se vuelve a crear automáticamente. El importe procede del pedido reservado, nunca del cliente.

Conciliación explícita preparada: `reconcilePayment({admin, provider, paymentId})`. El webhook firmado usa exactamente la misma función y consulta el pago autenticado. Reservas vencidas no se reactivan con pagos tardíos. Rechazo/cancelación del *intento* conserva la reserva hasta la expiración normal o cancelación deliberada del pedido: permite otro intento y evita liberar stock cuando existe una aprobación simultánea. Devolución total/parcial, mediación, contracargo, importe incorrecto o segunda aprobación incompatible crean un bloqueo financiero; no ejecutan una devolución ni restituyen stock. Ver [estados del recurso pago oficial](https://github.com/mercadopago/openapi/blob/main/schemas/payments.yaml).

Decisiones del titular: política de cancelación, plazo de reserva, medios offline admitidos, devoluciones parciales, comprobación física antes de reingresar stock y responsable de contracargos/evidencia. Preparar alertas y cola de revisión antes de un piloto. No hay endpoint para emitir refunds, resolver disputas o levantar bloqueos automáticamente.

## Correo Argentino — MiCorreo

| Dato a solicitar a Correo/titular | Configuración o destino |
| --- | --- |
| Usuario y contraseña **API** de MiCorreo para ambiente de prueba | `CORREO_MICORREO_USER`, `CORREO_MICORREO_PASSWORD`; no confundir con contraseña de la cuenta web |
| `customerId` correspondiente a esa cuenta/contrato | `CORREO_MICORREO_CUSTOMER_ID` |
| Habilitación/contrato de prueba y posteriormente comercial | `CORREO_MICORREO_ENVIRONMENT=test` / `production`; no mezclar credenciales |
| Código postal real del remitente | `CORREO_ORIGIN_POSTAL_CODE`; `MOCK_ORIGIN_POSTAL_CODE` no demuestra un domicilio comercial |
| Remitente completo | Nombre/razón social, email, teléfono, calle/número, piso/depto, ciudad, provincia canónica y CP; datos para `snapshot.sender` aprobado |
| Servicios y modalidades habilitados | Producto contratado, domicilio/sucursal, agencias, límites, valor declarado, seguro y tarifas de la cuenta |
| Medidas verificadas fuera de la política minorista existente | `CORREO_VERIFIED_PARCELS_JSON` para productos individuales; no cambiar cajas/mates/sets minoristas sin medición y revisión |
| Documentación vigente de etiquetas y tracking **para ese contrato MiCorreo** | Endpoints, autenticación, formato PDF/ZPL, correlación `extOrderId`/pedido/bulto, estados, cuotas y ejemplos oficiales |

El adaptador conserva los hosts fijos `apitest.correoargentino.com.ar/micorreo/v1` y `api.correoargentino.com.ar/micorreo/v1`, Basic para `/token`, Bearer para `/rates`, `/agencies` e `/shipping/import`. Cotiza con CP de origen/destino y medidas enteras g/cm. Importa con `extOrderId=MB-<pedido>-<bulto>` y destinatario validado. No permite redirects del transporte. Las consultas seguras tienen reintentos acotados; una importación ambigua/duplicada pasa a revisión, y solo rechazo explícito 429 admite reintento del mismo bulto. [Portal oficial MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/faqs).

`confirmWholesaleParcels` prepara un plan de 1–20 bultos medidos y confirmados por operario, actor/fecha, valor declarado distribuido en centavos e identificadores estables. **No** convierte una solicitud mayorista en pedido pagado, no publica una ruta nueva ni encola envíos. El enlace comercial con un pedido/venta existente requiere confirmación operativa. La política minorista no se modificó.

MiCorreo import devuelve `createdAt`; no demuestra que exista una etiqueta ni que el paquete se despachó. No se inventaron rutas de etiquetas/tracking ni se sustituyó MiCorreo por la API PAQ.AR 2.0. Se conserva `recordVerifiedDispatch`, que exige evidencia correlacionada y rechaza tracking mock. La demostración local usa esa interfaz con una evidencia sintética explícita. **Completar el adaptador real de etiquetas/tracking depende de documentación/contrato**, y bloquea el E2E real de despacho automatizado.

El worker está preparado como invocación explícita `runShipmentJob`; su default rechaza un proveedor real. No se inició ningún servicio logístico ni se creó un envío externo.

## Resend — pedidos por REST, Auth por SMTP de Supabase

Resend encaja con el diseño: REST para outbox, idempotencia y recibos firmados; SMTP para que Supabase conserve verificación/recuperación. No se encontró una razón técnica para cambiar de proveedor. Su [idempotencia dura 24 horas](https://resend.com/docs/dashboard/emails/idempotency-keys), por lo que el worker local usa el mismo mensaje/clave y pasa a revisión a las 23 h; no renueva esa ventana ni crea un enlace distinto al reintentar.

| Dato necesario | Destino preparado |
| --- | --- |
| Dominio/subdominio que posee MateBreak y acceso al DNS | Resend Domains; todavía no se eligió ni modificó un dominio |
| Remitente autorizado y dirección de respuestas | `RESEND_FROM_EMAIL`; argumento `from` del worker; contacto comercial en plantilla |
| API key con permiso de envío para ese dominio | `RESEND_API_KEY`, solo backend/worker; `createResend` requiere opt-in explícito |
| Secreto `whsec_…` del webhook | `RESEND_WEBHOOK_SECRET`; handler de recibos preparado, sin endpoint registrado |
| Clave aleatoria de cifrado AES-256-GCM, 32 bytes/64 hex minúsculas | `EMAIL_ENVELOPE_KEY`, gestor de secretos del worker; generar fuera de Git y mantenerla recuperable |
| Plan, volumen y responsable de alertas/rebotes | Decisión comercial previa a activar; verificar cuotas de la cuenta |
| SMTP de Auth | En Supabase Auth: host `smtp.resend.com`, puerto `465` TLS implícito o `587` STARTTLS, usuario `resend`, contraseña API key, remitente de dominio verificado |

Los parámetros SMTP proceden de [Resend SMTP](https://resend.com/docs/send-with-smtp). Cargar las plantillas locales `docs/email-templates/confirmation.html` y `recovery.html` y sus asuntos en Supabase solamente tras autorización. Mantienen `{{ .ConfirmationURL }}` y la identidad visual de MateBreak. Desactivar click/open tracking de Auth para no alterar enlaces de un solo uso. Supabase conserva su canal de envío; no se habilitó un mecanismo alternativo para eludir el SMTP predeterminado.

`requestPasswordRecovery` y `completePasswordRecovery` están preparados y probados como acciones deshabilitadas por defecto, con retorno exacto, respuesta genérica y sesión viva obligatoria para cambiar contraseña. **Falta conectar la UI/rutas y homologar la recuperación PKCE** antes de activarlas. El callback futuro `/auth/recuperar` no está agregado a Cloud; requiere aprobación del destino exacto. No se presenta la recuperación pública actual como funcional.

El outbox existente genera confirmación, pago, cancelación y despacho verificado. El nuevo worker congela destinatario, HTML/texto, remitente y capacidad privada en un envelope cifrado autenticado por evento. Solo guarda hashes para validar enlaces privados y no registra cuerpos/PII en logs. `sent` significa aceptación del proveedor, **no entrega al buzón**. Los recibos firmados de Resend registran hechos mínimos, con dedupe, incluso si llegan antes del acknowledgement. La integración HTTP y alertas de rebotes/supresiones todavía deben conectarse bajo revisión.

No perder/rotar destructivamente la clave de cifrado mientras existan eventos pendientes. Respaldar el secreto con acceso restringido; retención/eliminación y rotación por versión requieren procedimiento aprobado. Error 429: retry acotado. Timeout/5xx/409/respuesta incompleta: revisión. No hay resend automático de una aceptación dudosa ni reenvío después de 24 h.

### Plan DNS listo para completar con los valores de la cuenta

Sin dominio y registro de Resend, **no es posible calcular la clave DKIM ni los valores exactos de SPF/MX**. Obtener/exportar los registros desde Resend Domains para el dominio y región elegidos; no usar claves de ejemplo ni inventar el DNS comercial.

| Registro | Nombre/valor a cargar posteriormente | Control previo |
| --- | --- | --- |
| DKIM | TXT/CNAME de selector y clave **exactos** que devuelve Resend | No reemplazar otros selectores; registro DNS sin proxy |
| SPF del Return-Path | TXT `v=spf1 …` **exacto** de Resend en el host elegido | Un solo SPF por nombre; combinar emisores existentes únicamente tras inventario y verificar límite de consultas |
| MX del Return-Path | Host, prioridad y destino **exactos** de Resend | Afecta el subdominio de retorno; conservar el MX del correo corporativo raíz |
| DMARC | TXT `_dmarc.<dominio>`; propuesta `v=DMARC1; p=none; rua=mailto:<buzón-real-de-reportes>;` | Sustituir el marcador por un buzón que exista; no crear un segundo DMARC ni debilitar una política existente |

Elegir un subdominio transaccional reduce interferencia con correo corporativo; aprobarlo antes de crear DNS. Empezar DMARC en observación únicamente si no existe una política más fuerte; pasar a quarantine/reject tras revisar alineación y entregabilidad de **todos** los emisores. TTL inicial sugerido 300–3600 s sujeto al DNS. Validar SPF, DKIM y DMARC en headers reales durante el piloto autorizado. [Verificación de dominios](https://resend.com/docs/dashboard/domains/introduction), [DMARC](https://resend.com/docs/dashboard/domains/dmarc).

No copiar este documento como comandos de activación: faltan datos comerciales reales, contratos, controles operativos y una autorización independiente para publicar/transportar.
