# Ciclo de vida del pedido minorista real

Esta auditoría parte de `3836f64`. Los proveedores reales siguen apagados y
los pedidos mock continúan solo en memoria. La migración
`20260929204150_fix_minorista_checkout_lifecycle.sql` quedó preparada en el
repositorio, sin aplicarse al proyecto Supabase ni habilitar métodos.

## Creación y reserva

El navegador envía variante, cantidad, destinatario, modalidad, método y una
clave UUID de idempotencia. `mb_checkout_minorista` valida usuario, carrito,
métodos activos y, para envíos, una cotización vigente que pertenezca al mismo
carrito y usuario y coincida con modalidad y destinatario. La tarifa sale de
`checkout_cotizacion_envio`, nunca del importe enviado por el navegador.

Dentro de una única transacción PostgreSQL, `mb_cotizar_catalogo` calcula
precios en ARS desde el catálogo. `mb_checkout_catalogo` toma el advisory lock
de inventario y el del usuario, bloquea carrito, variantes, mappings y filas
de stock, verifica componentes y descuenta el stock reservado. Escribe
`pedido`, `pedido_item`, `pedido_stock`, movimientos negativos de reserva,
`pago` pendiente y `envio`. El wrapper fija descuento, costo de envío y plazo
final antes de que la transacción termine. Un fallo revierte todo. La prueba
con dos checkouts simultáneos de dos unidades, cuando solo quedaban dos,
confirmó un único éxito, un rechazo por stock y ninguna reserva parcial.

La reserva reduce inmediatamente `producto_simple.stock`; por eso aprobar el
pago **no vuelve a descontar stock**. Mercado Pago tendría una hora de reserva
y transferencia, 24 horas. `mb_confirmar_pago` bloquea el pedido y pago,
compara referencia, importe y moneda, y acepta repetir la misma confirmación
sin duplicar efectos. Un pago rechazado/cancelado llama a la cancelación del
pedido, que devuelve cada componente y caja una sola vez y deja movimientos
de liberación. `mb_expirar_reservas` hace la misma liberación al vencer, marca
el pedido `expirado` y conserva su historial.
La confirmación y la validación de la tarifa usan la hora real de decisión
(`clock_timestamp()`), incluso si una transacción esperó un lock hasta después
del vencimiento.

La clave de idempotencia es única por usuario en PostgreSQL. Repetirla,
incluso concurrentemente, devuelve el mismo pedido. Un carrito convertido no
acepta una clave nueva: para una compra intencional nueva se usa otro carrito.
La ruta Node no inicia una nueva preferencia de pago al recibir nuevamente un
pedido ya pagado, cancelado o expirado; devuelve su estado persistido.
La migración corrige precisamente este punto y la dependencia previa del
checkout minorista respecto de que transferencia y retiro estuvieran activos
para poder reservar una compra con Mercado Pago y entrega a domicilio. La
cotización comercial definitiva se calcula después de que PostgreSQL bloquea
las filas del catálogo, evitando usar un precio leído antes de la reserva.

## Estados y transiciones

| Desde | Hacia | Operación |
| --- | --- | --- |
| `pendiente_pago` | `pagado` | Confirmación verificada del pago o transferencia administrativa. |
| `pendiente_pago` | `cancelado` | Rechazo/cancelación; libera reserva. |
| `pendiente_pago` | `expirado` | Vencimiento; libera reserva y conserva pedido. |
| `pagado` | `en_preparacion` | Preparación del envío. |
| `en_preparacion` | `enviado` | Despacho. |
| `enviado` | `entregado` | Entrega confirmada. |

`enviado` es el equivalente persistido de “despachado”. La función
`mb_actualizar_envio` restringe los tres últimos pasos. El constraint de
`pedido.estado` limita los valores permitidos; la nueva migración agrega un
trigger que impide retrocesos o saltos de estado incluso ante una actualización
directa. No se agregaron estados duplicados. Un pago tardío sobre pedido
cancelado o expirado requiere revisión manual y no reactiva stock
automáticamente.

## Proveedores y transferencia

El redirect del navegador solo muestra el estado consultado al servidor. El
webhook de Mercado Pago verifica firma, vuelve a consultar el pago por API,
compara pedido, importe y moneda y recién entonces invoca la confirmación SQL
idempotente. La creación de preferencia usa el total persistido. Nada de esto
se activó en esta iteración.

La transferencia crea el mismo pedido pendiente con reserva de 24 horas. La
confirmación exige rol administrativo en la ruta Node, vuelve a validar actor
en SQL, confirma una sola vez y guarda actor, referencia y fecha en
`private.confirmacion_transferencia`. Su vencimiento/cancelación libera stock.
Los datos bancarios no se modificaron.

## Verificación

- 18/18 archivos SQL de regresión ejecutados contra el esquema actual de
  Supabase. Los que crean fixtures usan `BEGIN`/`ROLLBACK`; se comprobó que
  los métodos de pago y envío permanecieran inactivos después. Una prueba
  antigua esperaba `cancelado` al vencer; se actualizó a `expirado`, estado
  introducido por la migración minorista, manteniendo la comprobación de
  liberación única de stock.
- Los 18 archivos SQL también pasaron con la nueva migración cargada
  temporalmente dentro de cada transacción y revertida con `ROLLBACK`.
  Se verificó después que la migración seguía sin aplicarse y que todos los
  métodos reales permanecían inactivos.
- PostgreSQL 18 local aislado: 9/9 escenarios SQL de pedido, cotización,
  importes, pago, cancelación, expiración y transferencia; 2/2 competencias
  concurrentes del wrapper minorista, con espera por advisory lock observada.
  El script reproducible es `scripts/test-order-lifecycle.mjs` y exige una
  base nueva cuyo nombre empiece por `matebreak_minorista_` en un puerto local
  distinto del predeterminado.
- La batería anterior de concurrencia de SKU, combo, caja e idempotencia se
  repitió: 20/20. Ver `concurrencia-stock-aislada.md`.
- La suite Node quedó en 71/71.

Para activar el flujo real más adelante todavía faltan credenciales, pruebas
con las cuentas de los proveedores, aplicar la migración mediante el proceso
de despliegue de base de datos y habilitar los métodos reales. Esta auditoría
no hace ninguno de esos pasos.
