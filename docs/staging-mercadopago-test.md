# Staging: Mercado Pago TEST y envío mock

Este contrato es exclusivo de Staging. No cambia producción, MiCorreo, emails,
las 39 migraciones ni el cálculo financiero de PostgreSQL. Los pedidos históricos
#1003, #1004 y #1005 son TEST-LOCAL; no acreditan Mercado Pago ni su webhook.

## Dos circuitos separados

| Variable | Mock persistido | Transporte Mercado Pago TEST |
| --- | --- | --- |
| APP_ENV | staging | staging |
| NODE_ENV | development | development |
| SHIPPING_MODE | mock | mock |
| PAYMENTS_MODE | mock | real |
| MATEBREAK_STAGING_PERSIST_MOCK | 1 | 0 |
| MATEBREAK_STAGING_MP_TEST | 0 | 1 |
| MP_ENVIRONMENT | sin credenciales MP | test |
| MP_EXPECTED_LIVE_MODE | sin credenciales MP | false, literal en minúsculas |

El segundo circuito exige además el collector ID numérico, credencial de prueba
TEST- y secreto del webhook configurados sólo en Render. No se permite una
credencial APP_USR en esta excepción: la documentación actual también utiliza
APP_USR para vendedores de prueba, pero admitirla requiere comprobar un contrato
de cuenta distinto. No se puede aceptar el prefijo como prueba de identidad ni
activar una cuenta productiva con envío simulado. Confirmar el tipo de credencial
es un punto de control previo al deployment, sin compartirla.

Mantener `MATEBREAK_LOCAL_ONLY`, `MATEBREAK_LOCAL_PERSIST_MOCK` y
`MATEBREAK_LOCAL_PICKUP_MOCK` apagados, Supabase Staging con su referencia exacta,
APP_ORIGIN HTTPS del frontend Staging y todos los flags de emails, workers,
receipts, conciliación periódica y recuperación apagados. El arranque conserva
la expiración de reservas ya existente; no agrega cron ni activa proveedores.

## Identidad y live_mode

`MP_COLLECTOR_ID` identifica al usuario vendedor receptor del pago. Debe ser el
User ID del vendedor que corresponde a la credencial de esta integración,
verificado por el titular en Tus integraciones / Cuentas de prueba o mediante
la consulta autenticada oficial `GET /users/me` realizada de forma privada por
el titular. No es el comprador, el ID de la aplicación ni la Public Key. No se
deriva de fragmentos del Access Token. No inventar un ID si el panel no permite
establecer su correspondencia.

`MP_EXPECTED_LIVE_MODE=false` significa que la respuesta autenticada del payment
debe contener el booleano JSON `live_mode:false`. `test` es una etiqueta de
configuración y no cambia el host de la API. Una URL de Checkout Pro tampoco
demuestra que el payment sea TEST. Este contrato no autoriza aceptar `true` con
shipping mock, aunque exista otra modalidad de cuentas ficticias.

La configuración valida estos datos antes de crear clientes. El adaptador exige
token, secreto, origen HTTPS, collector numérico y booleano explícito. La
reconciliación compara estrictamente `payment.collector_id`, `payment.live_mode`
y `payment.id` con el contrato configurado, UUID de external_reference, ARS,
monto exacto y pedido interno. Inconsistencias se rechazan o van a revisión; no
se confirman desde el body del webhook ni desde la redirección del navegador.

## Checkout y notificación

El opt-in TEST es incompatible con persistencia mock. El pedido se crea por la
RPC normal, queda pendiente y utiliza un intento de preferencia idempotente.
Este camino no llama `mb_mark_mock_payment` ni `mb_confirmar_pago` con TEST-LOCAL.
La confirmación depende del payment consultado por API y de la RPC atómica
`mb_reconcile_mp_payment`. Se conservan firma, auditoría, stock y controles de
duplicación. No se repiten migraciones ni se modifica el proveedor de envío.

Endpoint configurado en el panel:
`https://matebreak-api-staging.onrender.com/api/pagos/mercadopago/webhook`.
El backend espera `?type=payment&data.id=<id>` y headers `x-signature` y
`x-request-id`. El body es sólo un hint; no proporciona estado financiero.
La preferencia conserva el notification_url del APP_ORIGIN mediante el proxy
Staging, que alcanza el mismo backend. No confundir estas dos URLs al investigar.

El titular realizará la compra manual y después la notificación desde el panel,
como fue autorizado. Registrar por separado payment de prueba consultable y
notificación firmada desde Tus integraciones. No presentar esta prueba como
evidencia de envío automático del webhook de la compra. Un ID ficticio del
simulador sin payment consultable no alcanza para aprobar el pedido.

Después se verificará `pago_webhook_auditoria`, resultado approved/aplicado y el
replay del mismo payment sin duplicar pago, stock ni eventos. Hasta ese momento
Mercado Pago E2E permanece PENDING. No ejecutar compras o notificaciones desde
scripts de esta publicación.

## Publicación y recuperación

Sólo publicar el SHA exacto aprobado por pruebas y CI en Render Staging. Verificar
deployment/commit Live, healthcheck 200 y el log sin secretos:
`Shipping mock · Payments real/test · Mercado Pago ready`.
Ready acredita configuración del adaptador, no aceptación de la credencial por
la API ni éxito de una compra. Tras modificar variables, es necesario reiniciar
o redesplegar Render; el deploy del nuevo SHA ya realiza ese reinicio.

Para volver al circuito mock se requiere una operación manual coordinada:
PAYMENTS_MODE=mock, MATEBREAK_STAGING_MP_TEST=0,
MATEBREAK_STAGING_PERSIST_MOCK=1 y retirar las credenciales MP del runtime mock.
No dejar ambos circuitos activos. No hay rollback SQL ni restauración de DB37
sobre Cloud. Volver al SHA anterior exige también restaurar su configuración
mock compatible; el código anterior no acepta credenciales MP en Staging.

## Fuentes y reproducción

- [Cuentas de prueba oficiales](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/test-accounts).
- [Notificaciones oficiales](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/notifications/webhooks).
- `node --test tests/staging-mp-test.test.mjs tests/providers.test.mjs tests/staging.test.mjs tests/payment-reconciliation.test.mjs`.
- `npm test`, `npm run test:full` exclusivamente en el stack local descartable.

No guardar credenciales ni payloads completos de pagos/clientes en esta evidencia.
