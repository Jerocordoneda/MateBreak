# Checkout sin registro — informe local y plan de publicación

Fecha: 2026-10-03. Rama: `codex/staging-preparation`. Base recuperada: `3a8e59628f8ecad9c0e27293f0700063b3bf8829`.

## Recuperación y alcance

Se revisaron HEAD, status, diff y las implementaciones parciales antes de continuar. No existían commits nuevos de Guest Checkout. Se conservaron los fixtures/mapping y documentos E2E pendientes anteriores; no pertenecen a estos commits.

Estaban adelantados el checkout sin login, las adaptaciones de tres RPC, la credencial independiente de Comprar ahora y las bases del acceso privado/outbox. Se completaron la integración de ambos carritos, cancelación y vencimiento para invitados, snapshots comerciales, consulta minimizada, procedencia del pago mock, correos, seguimiento verificado, pruebas y vistas previas.

No hubo push, deployment, consultas ni escrituras Cloud en esta iteración. Los dos pedidos y el stock 98/98 de Staging no fueron intervenidos; ese valor es el baseline previamente aprobado, no una nueva auditoría remota realizada aquí.

## Checklist final

| Requisito | Estado y evidencia |
|---|---|
| Producto → carrito → Entrega → Pago → resultado, sin cuenta | Implementado; recorrido completo en navegador con SQL desechable y pago mock aprobado |
| Auth opcional y precarga | Implementado; navegador con stub local de usuario y pruebas HTTP/SQL de propietario autenticado |
| Comprar ahora → carrito independiente | Implementado; cookies separadas, variante/cantidad/grabado/promoción conservados; carrito ordinario intacto |
| Precios y stock autoritativos | RPC conserva cálculos, locks y reservas; valores de navegador no se aceptan como precio o identidad |
| Concurrencia e idempotencia | Dos conexiones PostgreSQL reales: mismo request produce un pedido; carritos competidores no sobrevendieron |
| Invitados sin Auth artificial | `usuario_id` nullable; prueba SQL confirma cero usuarios para compras invitadas |
| Acceso privado | Token de 256 bits, SHA-256, intercambio de uso único, cookie HttpOnly, expiración, revocación y recuperación genérica |
| Outbox persistente | Eventos únicos, claims con SKIP LOCKED, reintentos limitados y revisión ante resultado incierto |
| Correos HTML/texto | Recibido, pago confirmado/pendiente, cancelación, renovación y despacho; logo real y branding oficial |
| Despacho | Solo evidencia verificada del transportista; cotización/importación sin verificación no anuncian despacho |
| Correo y tracking externos | Pendientes; no transporte real, scheduler ni credenciales nuevos |
| Gmail/Outlook reales | Pendiente; se validó Chromium desktop/móvil e imágenes bloqueadas, no esos clientes reales |

## Arquitectura y contratos

El carrito ordinario conserva su credencial HttpOnly. Comprar ahora usa otra credencial HttpOnly y redirige a `/carrito?directa=1`; únicamente esa selección continúa a `/checkout?directa=1`. La actualización de cantidades utiliza el token correcto y el badge sigue representando el carrito ordinario. Se corrigió una diferencia real entre `req.path` del middleware y del handler `/api/carrito` que inicialmente mezclaba la selección al consultarla.

El checkout utiliza el usuario verificado por el servidor cuando existe; para invitados pasa NULL. El email, `usuario_id`, importes o descuentos del request no prueban identidad. Se conserva el destinatario comercial como snapshot del pedido, sin crear cuentas. Los RPC mantienen bloqueos de inventario, una reserva por componente, validación de cotización/fingerprint y recomputación de importes.

La clave idempotente se acota al carrito. Un replay con la misma selección y datos devuelve el pedido original; cambios de destinatario/medio/modalidad/cotización se rechazan. Cancelación y vencimiento liberan una sola vez las reservas pendientes y no cancelan pedidos pagados. La transferencia conserva la política anterior: descuento del pedido una vez, sin descontar nuevamente el precio de cada línea.

El resultado invitado se consulta mediante la credencial de su carrito vigente. La consulta privada devuelve una vista mínima, no referencias internas de proveedores, email, teléfono, clave idempotente ni IDs de carrito. Conserva la fecha de vencimiento necesaria para el resultado de transferencia. Reconoce tanto `pagos` como contratos legacy `pago` donde corresponde. No se reasignan pedidos antiguos ni se generan eventos retrospectivos.

## Enlace privado

`server/orders/private-access.mjs` genera 32 bytes aleatorios y persiste solo SHA-256. El enlace lleva el secreto en el fragmento; la página lo elimina del historial antes de intercambiarlo. No se guarda en localStorage/sessionStorage ni se registra. La sesión se entrega exclusivamente en cookie HttpOnly/Secure/SameSite=Strict, con prefijo `__Host-` en HTTPS.

El enlace vence a los siete días; solo se intercambia una vez. La sesión dura hasta 24 horas y nunca supera el vencimiento del enlace. Las lecturas validan pedido, sesión, expiración y revocación. El UUID/número/email solos no autorizan consultas. La credencial de carrito también se rechaza si venció.

La página utiliza recursos propios, CSP, `no-referrer`, no analytics y noindex. La API aplica no-store y respuestas genéricas. Renovación: número + email, respuesta uniforme, máximo un evento diario por pedido y límite de solicitudes. La revocación es una operación interna service-only, no una mutación pública.

La mitigación de abuso actual es por proceso/IP de conexión y conserva los controles Origin/JSON existentes. No se habilitó confianza indiscriminada en headers proxy. Antes de escalar a réplicas o producción pública debe revisarse un limitador compartido/edge y el tratamiento seguro de IP detrás de Render.

Referencias de diseño: [OWASP: recuperación mediante tokens](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) y [Supabase: RLS y service roles](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Migraciones preparadas, solamente locales

1. `20261003001216_guest_checkout_ownership.sql`: propietarios nullable, idempotencia por carrito, número público para nuevos pedidos, snapshots de precio original/imagen, tres RPC de checkout, cancelación/vencimiento interno y consulta por carrito.
2. `20261003001218_private_order_access_and_notifications.sql`: procedencia mock, presentación segura de tarjeta, verificadores privados, outbox, sesiones/renovación/revocación, vista mínima y despacho verificado.

Las 26 migraciones anteriores mantienen exactamente sus SHA-256 físicos frente al manifiesto aprobado. Localmente se aplicaron 28 migraciones a bases nuevas. No se desactivó RLS; las nuevas tablas privadas tienen RLS y no otorgan acceso a anon/authenticated. Las nuevas funciones son invoker con search_path vacío y ACL explícita para service_role.

SHA-256 físicos antes de versionar:

```
guest_checkout_ownership.sql
d4eb534c8d539d08e7310c6aed5204d7121945b32da236475b3c3d66247f606d
private_order_access_and_notifications.sql
cb55d54c5a7b7c620acb375d301316d275355d8ac306f811d9651a62a7742f43
```

Git usa autocrlf en este equipo. La auditoría de la base compara también el árbol aprobado mediante `git cat-file --filters`, sin reescribir los archivos. Para un futuro push SQL se debe manifestar nuevamente el archivo físico efectivamente utilizado.

## Emails y seguimiento

Los templates usan tablas, estilos inline, fallback Geist/Inter/Arial/Helvetica, negro/beige `#d8c3a5`, logo izquierdo y número derecho. Hay HTML y texto plano, fotos o «Foto pendiente», opciones/grabado, cantidades, precio original/promoción, mercadería cotizada, descuento de pago, envío y total. Los textos distinguen recibido, pendiente y pagado; un evento paid no se renderiza sin pago aprobado.

Solo se permiten marca de tarjeta allowlisted y cuatro dígitos informados por el proveedor autenticado. Nunca se persiste el objeto tarjeta/PAN/CVV. Mock se identifica expresamente y no inventa datos de tarjeta. Transferencia pendiente nunca se presenta como confirmada.

La cola se alimenta por cambios de pedidos nuevos; no hay backfill. El adapter mock deduplica por event ID y no envía mensajes. Su drenaje es explícito, no se inicia desde createApp ni se configura un worker. Fallos comprobados antes de aceptación pueden reintentarse con backoff, hasta cinco intentos; aceptación incierta o claim abandonado pasa a revisión. Un transporte real necesitará idempotencia durable y contrato de aceptación documentado.

El tracking mock devuelve ausencia de seguimiento. El adapter real aún no está conectado. La persistencia de despacho exige correlación pedido/código/estado verificado más snapshot real importado. Una cotización, etiqueta o importación por sí sola no basta. Webhooks repetidos no duplican el evento shipped; un código diferente exige revisión. El botón usa el [seguimiento oficial de Correo Argentino](https://www.correoargentino.com.ar/seguimiento), mostrando el código para ingresarlo; no inventa parámetros de URL.

El logo MateBreak se recuperó del recurso real ya usado por la marca; SHA-256 `ab11a4fb89f8cd51dedff268ae7638b10d6843fdfbee432323216c525fe9fc0f`. El PNG de Mercado Pago proviene del paquete enlazado en su [página oficial de marca](https://www.mercadopago.com.ar/mp/logo-oficial); SHA-256 `863719a51c238ef136f6ad53b9c25e3589846e06930bce6c6df5282cd4c1340f`. No se copiaron metadatos/archivos accesorios del ZIP.

Contacto, WhatsApp, remitente y Reply-To comerciales necesitan confirmación. No se inventó un número de atención. El template acepta contacto/WhatsApp validado; su ausencia se documenta como pendiente antes de habilitar correo real. Las previews muestran únicamente datos ficticios.

## Validación final

- Node **22.23.3**; `npm ci`: 120 paquetes instalados, 121 auditados, **0 vulnerabilidades reportadas**.
- `npm test`: **209 pruebas, 209 aprobadas; 0 fallidas, omitidas o canceladas**.
- `npm run build`: aprobado, conserva `isDeepStrictEqual` y el vercel.json anterior sin cambios.
- `scripts/audit-guest-artifact.mjs`: **142 archivos estáticos**, hashes iguales a sus fuentes, exclusivamente index/src; sin backend, SQL, logs, archivos privados ni patrones de credenciales. `.vercelignore` y configuración de hosting no cambiaron.
- PostgreSQL 17.6 desechable, sin puertos publicados: las 28 migraciones y tests SQL aprobados. Transacciones de checkout/precios hacen rollback; bases del runner se eliminan al finalizar.
- SQL: invitados/autenticados, cotización mock 8.500, total 18.500, reservas, replay, payload distinto, pago duplicado, cancelación y expiración idempotentes, precios 1/2/8/10 = 10.000/16.000/64.000/80.000, envío gratis en el umbral correcto, combos legacy, transferencia sin doble descuento y cambios de precio/stock.
- SQL: sesiones/enlaces propios/ajenos, vencidos/revocados, credencial de carrito vencida, renovación, ACL real con service_role/anon/authenticated, despacho verificado/deduplicado y rechazo de seguimiento incompatible. Conexiones simultáneas comprueban overselling, compra única y claim único.
- Navegador Chromium real: carrito ordinario y directo independientes; compra directa invitada aprobada localmente; resultado/consulta; checkout ordinario sin formulario de Auth; precarga opcional local. Desktop y 360 px, sin desbordamiento horizontal en las vistas finales verificadas.
- Previews desktop/móvil de recibido/despacho; tarjeta Visa terminada en 5365, transferencia pendiente e imágenes bloqueadas. La preview de despacho usa `SYNTHETIC1234`, no un envío real.

Límite de evidencia: SQL usa esquema auth mínimo y roles PostgreSQL reales, no GoTrue completo. La sesión autenticada del navegador es un stub explícito del harness local; no prueba login/confirmación real de Supabase. No se probó entrega Gmail/Outlook ni proveedor externo de tracking. Esas verificaciones necesitan una fase autorizada posterior.

Se encontraron avisos de `/api/sesion` y `/api/direcciones` en el harness autenticado por falta de `mb_rol` y del contrato de lectura de direcciones. Se incorporó ese RPC local real y se completó el stub explícito de perfil/direcciones. La navegación autenticada se volvió a comprobar sin aviso ni errores de Console. No se cambió el producto para ocultar esos fallos de infraestructura de prueba.

## Commits y diff

| Commit local | Responsabilidad |
|---|---|
| `35c8724` | Migraciones, pruebas SQL con rollback/concurrencia y runtime PostgreSQL desechable |
| `1b68ace` | Backend invitado, separación de credenciales, acceso privado, presentación segura de pago y regresiones HTTP |
| `756babf` | Checkout/carrito/ficha/consulta privada, correos y tracking mock, assets y tests de presentación |
| Commit de este informe | Harnesses de navegador/correos, auditoría del artefacto y documentación |

Revisión: cambios explícitos de esta etapa, sin alteraciones de `vercel.json`, `.vercelignore`, package.json/lock, migraciones anteriores o configuración Cloud. `git diff --check` aprobado. Los pendientes anteriores siguen fuera de los commits; por ello el worktree global conserva cambios ajenos a esta entrega. La cadena avanza desde 3a8e596 sin reescribir historia.

## Evidencias y ejecución local

Logs, manifiesto estático y capturas se conservan fuera del repo, en `.codex/staging-preflight`. Capturas finales: `email-received-desktop.png`, `email-received-mobile.png`, `email-shipped-desktop.png`, `email-shipped-mobile.png`, `email-transfer-blocked-mobile.png`, `guest-checkout-mobile.png`, `auth-checkout-desktop.png`, `private-order-desktop.png`, `private-order-mobile.png` y `direct-cart-desktop.png`. No incluyen credenciales ni datos de los pedidos Cloud.

Desde el worktree, usando Node 22.23.3 y únicamente el contenedor desechable con etiqueta `matebreak.test=guest-local`, sin puertos:

```cmd
node scripts/test-guest-sql.mjs
node scripts/preview-guest-local.mjs
node scripts/preview-order-emails.mjs
set STAGING_BACKEND_ORIGIN=https://matebreak-api-staging.onrender.com
npm run build
node scripts/audit-guest-artifact.mjs
```

Preview funcional: `http://127.0.0.1:3041/productos/mate-sintetico-local`. Preview de correos: puerto 3042, `/received`, `/shipped`, `/card`, `/transfer`; `?images=blocked` y `?format=text`. El endpoint `/preview/authenticated` solo existe en el harness loopback y crea un usuario sintético únicamente en la base desechable. Ningún harness se carga desde `server/index.mjs` o el frontend publicado.

## Publicación Staging propuesta — requiere autorización nueva

1. Revisar cadena de commits/diff y confirmar exclusión de pendientes antiguos. No push automático.
2. Reconfirmar baseline Cloud: dos pedidos, dos pagos mock, dos envíos pendientes y stocks 98/98, más las seis huellas anteriores. Respaldo recuperable y manifiesto explícito de las dos migraciones nuevas. No fixtures ni backfill.
3. Obtener autorización específica para aplicar únicamente las dos migraciones a `rxccjczyywhewqqdfgxm`, previo dry-run explícito. Ante cualquier diferencia/fallo, detener, sin repair o reintentos.
4. Auditar estructura/RLS/ACL/resultados: las nuevas huellas SQL cambiarán intencionalmente y deben contrastarse con el esquema local aprobado; las dos compras anteriores deben seguir intactas.
5. Con autorización de push/deployment, publicar la rama por fast-forward y exigir Security checks exitoso. Render manual al HEAD aprobado, Auto-Deploy OFF, mock persistente, Supabase Staging. Verificar sin comprar.
6. Generar **un prebuilt nuevo** con Node 22.23.3 mediante el procedimiento aprobado, auditar hashes/rutas/headers; Vercel manual exclusivamente `copplex1/matebreak-staging`, `prj_CrDsy4AToxUT27bCsEbuaDmAceJh`. Git desconectado; rewrites a Render Staging y noindex/no-store, incluida `/`.
7. No habilitar correo/SMTP/tracking real ni scheduler. El artefacto de esta entrega es el build estático auditado, no un prebuilt autorizado para publicar.

Una reversión de código no elimina automáticamente pedidos invitados ni nuevas estructuras. No preparar un rollback destructivo de datos: ante una incidencia, detener compras y revisar una corrección/rollback controlado con autorización y respaldo.

## Próxima E2E sin sesión — todavía no ejecutada

Nueva aprobación para una única compra invitada, email autorizado/datos sintéticos y providers mock. Antes de escribir, confirmar baseline 98/98 y snapshots/configuración. Navegador limpio sin Auth; producto 13, variante 2, NO, cantidades 1→2→1, personalización ficticia, precio 10.000, envío domicilio mock 8.500, total 18.500 y un bulto 17×17×17/550 g.

Capturar previamente el request exacto y su clave idempotente con el helper local ya preparado, sin exportar cookies/tokens a informes. Confirmar un pedido mock approved, verificar su propiedad invitada NULL y reservas. Solo tras éxito y evidencia suficiente, repetir una vez el mismo payload/sesión/clave; no reconstruir compras anteriores. Esperado: un pedido nuevo, un pago mock, una reserva por componente y stock 97/97, sin Auth adicional ni despacho.

Auditar SELECT de pedidos/pagos/envíos/pedido_stock/movimiento_stock y estado de outbox. Drenar mock solamente con aprobación separada y comprobar enlaces sin enviar correo real; los tokens mock deben permanecer locales privados. Escenarios rejected/pending continúan reservados para pruebas locales hasta nueva autorización. No limpiar compras ni reponer stock.
