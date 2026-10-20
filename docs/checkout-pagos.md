# Checkout, pagos y envíos

## Estado de esta iteración

El catálogo y el carrito viven en páginas distintas. «Agregar al carrito» conserva el carrito habitual; «Comprar ahora» crea un carrito independiente mediante una cookie `HttpOnly` y lleva a `/checkout?directa=1`. El checkout solicita y valida destinatario, deja editar el resumen y recalcula los importes en el servidor.

La migración `checkout_minorista_preparacion` reutiliza `mb_checkout_catalogo` como única implementación de reserva física. Dentro de la misma transacción guarda subtotal de mercadería, descuento de transferencia del 10%, costo real del transportista, costo cobrado al cliente, destinatario, modalidad y vencimiento. El envío gratis comienza en **ARS 80.000 de mercadería antes del descuento por pago**. Transferencia reserva por 24 horas; Mercado Pago, por una hora. La expiración preserva el pedido con estado `expirado` y libera componentes y cajas mediante la cancelación existente.

Los métodos reales de pago y envío siguen **inactivos** en Supabase. En desarrollo, `server/providers.mjs` selecciona proveedores mock y el pedido de prueba queda **solo en memoria**: no crea `pedido`/`pago` en SQL, no cobra ni reserva stock, y se pierde al reiniciar el servidor. El carrito y el catálogo existentes sí siguen usando Supabase. La interfaz no permite confirmar un pedido real hasta que MateBreak habilite los métodos tras las pruebas con sus cuentas y tarifas. `/api/pedidos` ya no crea pedidos con las reglas anteriores; el endpoint minorista es `/api/checkout/pedidos`.

## Probar el recorrido local

Con `SHIPPING_MODE=mock`, `PAYMENTS_MODE=mock` y `MOCK_PAYMENT_RESULT=approved`, ejecutá `npm run dev`. Elegí un mate o set, agregalo al carrito o usá «Comprar ahora», completá dirección y código postal, elegí entrega a domicilio y confirmá el pago de prueba. El servidor aplica el embalaje aprobado, cotiza cada bulto con `server/shipping/mock.mjs`, guarda la cotización temporalmente y devuelve un pedido de prueba con referencia `TEST-…`. El modo de prueba se indica en checkout y resultado; permite continuar como invitado. El precio de envío mock es **ARS 8.500 por bulto**, exclusivamente para probar la interfaz, sin relación con la tarifa real.

`MOCK_PAYMENT_RESULT=rejected` muestra rechazo; `pending` muestra pendiente. Reiniciá el servidor tras cambiar la variable. No se llama a Mercado Pago ni a MiCorreo en estos modos. En `NODE_ENV=production` el servidor rechaza ambos mocks. `SHIPPING_MODE=mock` junto con `PAYMENTS_MODE=real` también se rechaza para impedir cobros reales con una tarifa simulada.

## Proveedores

**Transferencia manual.** CBU, alias y titular están centralizados en `server/payments/transferencia.mjs`. El administrador tiene una lista de transferencias pendientes y una acción «Marcar como pagado» que exige rol administrador, referencia bancaria y deja auditoría. Repetirla no duplica efectos. El comprador puede copiar CBU/alias y enviar el comprobante por el [Instagram existente de MateBreak](https://www.instagram.com/matebreak.arg?igsi=MW5uZDlkM2lwYW0xNQ==). No se inventó un WhatsApp.

**Mercado Pago Checkout Pro.** `server/payments/mercadopago.mjs` crea preferencias con total tomado del pedido SQL, ARS, referencia interna y URLs de retorno. El navegador se redirige en la misma pestaña. El webhook verifica HMAC, vuelve a consultar el pago en la API oficial, compara referencia, importe y moneda, y usa la función idempotente de confirmación o la cancelación existente. Un pago aprobado después de vencer queda señalado para revisión manual. `PAYMENTS_MODE=real` requiere token, secreto de webhook y origen HTTPS; no se habilitó en producción. Los medios offline de Mercado Pago no se habilitaron ni se les asignó un vencimiento ficticio.

**Correo Argentino.** El adaptador soporta `/token`, `/rates`, `/shipping/import`, `/agencies` y diagnóstico opcional `/users/validate`; la integración real sigue apagada. La cotización tiene fingerprint y snapshot inmutable ligado al pedido. La importación por bulto usa trabajos backend después del pago, sin alterar estado financiero ante errores. No se programó el worker real. Ver [arquitectura, tests y pendientes de activación](micorreo-architecture.md). No consulta el cotizador público. El selector de sucursal continúa cerrado hasta probar las agencias habilitadas con la cuenta real. Los tres puntos comunicados de Tandil son referencias comerciales, no una lista exhaustiva ni un destino asignado automáticamente:

| Punto conocido | Dirección | Código postal |
| --- | --- | --- |
| Correo Argentino Clásico - Tandil | Gral. Pinto 623 | B7000GHM |
| Correo Argentino Clásico - Tandil UP 2 Kiosco Balbín | Av. Cristóbal Colón 1222 | B7000AZQ |
| Correo Argentino Clásico - Tandil UP Nro. 10 | Ricchieri 271 | B7000CME |

## Configuración de proveedores

| Variable | Desarrollo | Real |
| --- | --- | --- |
| `SHIPPING_MODE` | `mock` por defecto; tarifa sintética | `real` usa MiCorreo y exige credenciales. |
| `PAYMENTS_MODE` | `mock` por defecto; pedido temporal | `real` usa Checkout Pro y exige credenciales. |
| `MOCK_PAYMENT_RESULT` | `approved` por defecto; también `rejected`, `pending` | No se usa. |
| `MOCK_ORIGIN_POSTAL_CODE` | CP de origen de ejemplo (`7000`) para el proveedor de prueba. | No se usa. |

La selección ocurre en `server/providers.mjs`; el checkout consume las interfaces `quote` y `startPayment`. El proveedor real de MiCorreo sigue en `server/shipping/correo-argentino.mjs`, y el de Checkout Pro en `server/payments/mercadopago.mjs`. Para pasar a real habrá que cargar las credenciales, usar un origen público HTTPS, validar los proveedores con sus cuentas y habilitar los métodos inactivos en Supabase. No hay fallback silencioso de real a mock.

### Variables pendientes para real

| Variable | Para qué se necesita |
| --- | --- |
| `MP_ACCESS_TOKEN` | Crear preferencias y consultar pagos; se acepta el nombre anterior `MERCADOPAGO_ACCESS_TOKEN`. |
| `MP_PUBLIC_KEY` | Reservada para una futura UI que la necesite; Checkout Pro con redirección actual no la usa. |
| `MERCADOPAGO_WEBHOOK_SECRET` | Verificar las notificaciones firmadas. |
| `APP_ORIGIN` | URL HTTPS pública para retorno y webhook. |
| `CORREO_ENVIRONMENT` | `test` o `production`. |
| `CORREO_MICORREO_USER`, `CORREO_MICORREO_PASSWORD` | HTTP Basic para obtener el token oficial. |
| `CORREO_MICORREO_CUSTOMER_ID` | Cotizar con la cuenta de MateBreak. |
| `CORREO_ORIGIN_POSTAL_CODE` | CP real desde el que sale cada paquete. |
| `CORREO_VERIFIED_PARCELS_JSON` | Dimensiones y peso medidos por publicación. |

## Política de embalaje

`server/shipping/packaging.mjs` expresa las reglas operativas actuales en centímetros y gramos. Un mate solo usa **17 × 17 × 17 cm / 550 g**. Dos mates usan dos cajas chicas unidas, aproximadas como **34 × 17 × 17 cm / 1100 g**. Cada par adicional se trata igual y el mate impar queda en una caja chica. Uno o dos sets usan una caja grande de **30 × 30 × 20 cm**, con **1300 g por set**; tres sets se dividen en dos bultos. En pedidos mixtos se agrupan primero los sets y luego se añaden los mates sueltos en sus propias cajas, de forma conservadora.

La clasificación se obtiene de `producto.tipo` y las categorías guardadas en Supabase. Para termos o accesorios vendidos solos, el perfil medido por publicación en `CORREO_VERIFIED_PARCELS_JSON` sigue siendo una alternativa. Los pedidos con artículos no cubiertos o más de 20 bultos quedan sin cotización automática. MiCorreo `/rates` recibe un bulto por solicitud; para varios bultos se cotiza cada uno y se suman únicamente tarifas reales del mismo servicio. Estas dimensiones y pesos son estimaciones de depósito para cotizar, pendientes de validar con la cuenta comercial.

Siguen faltando credenciales de Correo Argentino y probar en su cuenta los servicios de sucursal, modalidades disponibles y tarifas para varios bultos. También quedan pendientes los vencimientos de medios offline de Mercado Pago y la disponibilidad real de cuotas. Nada de esto impide documentar y probar los proveedores con mocks.

Fuentes oficiales: [preferencias de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/create-payment-preference), [notificaciones firmadas](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-orders/notifications?scope=prod), [API MiCorreo](https://www.correoargentino.com.ar/MiCorreo/public/img/pag/apiMiCorreo.pdf).
