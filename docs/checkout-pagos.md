# Checkout, pagos y envíos

## Estado de esta iteración

El catálogo y el carrito viven en páginas distintas. «Agregar al carrito» conserva el carrito habitual; «Comprar ahora» crea un carrito independiente mediante una cookie `HttpOnly` y lleva a `/checkout?directa=1`. El checkout solicita y valida destinatario, deja editar el resumen antes de pagar y vuelve a cotizar precios y stock en SQL al crear el pedido.

La migración `checkout_minorista_preparacion` reutiliza `mb_checkout_catalogo` como única implementación de reserva física. Dentro de la misma transacción guarda subtotal de mercadería, descuento de transferencia del 10%, costo real del transportista, costo cobrado al cliente, destinatario, modalidad y vencimiento. El envío gratis comienza en **ARS 80.000 de mercadería antes del descuento por pago**. Transferencia reserva por 24 horas; Mercado Pago, por una hora. La expiración preserva el pedido con estado `expirado` y libera componentes y cajas mediante la cancelación existente.

Los tres métodos de pago y todos los métodos de envío siguen **inactivos** en Supabase. La interfaz no permite confirmar un pedido real hasta que MateBreak habilite los métodos tras las pruebas con sus cuentas y tarifas. `/api/pedidos` ya no crea pedidos con las reglas anteriores; el único endpoint minorista nuevo es `/api/checkout/pedidos`.

## Proveedores

**Transferencia manual.** CBU, alias y titular están centralizados en `server/payments/transferencia.mjs`. El administrador tiene una lista de transferencias pendientes y una acción «Marcar como pagado» que exige rol administrador, referencia bancaria y deja auditoría. Repetirla no duplica efectos. El comprador puede copiar CBU/alias y enviar el comprobante por el [Instagram existente de MateBreak](https://www.instagram.com/matebreak.arg?igsi=MW5uZDlkM2lwYW0xNQ==). No se inventó un WhatsApp.

**Mercado Pago Checkout Pro.** `server/payments/mercadopago.mjs` crea preferencias con total tomado del pedido SQL, ARS, referencia interna y URLs de retorno. El navegador se redirige en la misma pestaña. El webhook verifica HMAC, vuelve a consultar el pago en la API oficial, compara referencia, importe y moneda, y usa la función idempotente de confirmación o la cancelación existente. Un pago aprobado después de vencer queda señalado para revisión manual. `MERCADOPAGO_ENABLED=false` por defecto; requiere token, secreto de webhook y origen HTTPS. Los medios offline de Mercado Pago no se habilitaron ni se les asignó un vencimiento ficticio.

**Correo Argentino.** `server/shipping/correo-argentino.mjs` implementa la autenticación `/token`, cotización `/rates` y listado dinámico `/agencies` de MiCorreo. No consulta el cotizador público. La cotización se asocia al carrito y destinatario en SQL, vence, y el checkout toma su importe almacenado, nunca uno enviado por el navegador. El selector de sucursal continúa cerrado hasta probar las agencias habilitadas con la cuenta real. Los tres puntos comunicados de Tandil son referencias comerciales, no una lista exhaustiva ni un destino asignado automáticamente:

| Punto conocido | Dirección | Código postal |
| --- | --- | --- |
| Correo Argentino Clásico - Tandil | Gral. Pinto 623 | B7000GHM |
| Correo Argentino Clásico - Tandil UP 2 Kiosco Balbín | Av. Cristóbal Colón 1222 | B7000AZQ |
| Correo Argentino Clásico - Tandil UP Nro. 10 | Ricchieri 271 | B7000CME |

## Configuración pendiente

| Variable | Para qué se necesita |
| --- | --- |
| `MERCADOPAGO_ENABLED` | Bandera explícita; mantener `false` hasta finalizar pruebas de la cuenta. |
| `MERCADOPAGO_ACCESS_TOKEN` | Crear preferencias y consultar pagos. |
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
