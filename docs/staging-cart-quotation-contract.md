# Cotización del carrito — candidato local de Staging

## Fuente de verdad y compatibilidad

GET `/api/carrito` y los PUT de cantidades conservan los campos anteriores, incluidos `items`, `precio`, `subtotal` y `total`. Agregan `cotizacion`, calculada por el backend mediante la función SQL existente `mb_cotizar_catalogo(carrito_id, 'mercadopago')`. GET `/api/carrito/resumen` conserva su contrato y no ejecuta la cotización.

La cotización contiene líneas con `precio_unitario`, `precio_original`, `subtotal` y `subtotal_original`, además de `subtotal`, `subtotal_original`, `descuento_promocional`, `moneda`, `metodo_base` y `progress`. Los originales provienen del carrito leído en el servidor; los importes efectivos provienen del SQL. Las diferencias se calculan para presentación, sin replicar las reglas de elegibilidad o cantidades en JavaScript. Las lecturas del carrito y de la cotización son sucesivas, no una instantánea atómica; ante una suba concurrente, el original mostrado nunca queda debajo del precio cotizado. La confirmación sigue recomputando los importes y reservando stock en SQL.

`progress` usa exactamente `shippingProgress(cotizacion.subtotal)`, igual que el contexto de checkout: mercadería después de promociones y antes del descuento por medio de pago. No incluye envío. El umbral vigente permanece en ARS 80.000.

El navegador envía únicamente los campos admitidos para selección/cantidad/personalización. Precios, descuentos y stock suministrados por él se descartan. Una cotización inválida, inconsistente o no disponible devuelve `cotizacion: null` y `error_cotizacion`, conserva la selección y bloquea el botón de checkout hasta actualizarla. Frente a un backend anterior que todavía no devuelve estos campos, el frontend muestra explícitamente un subtotal estimado y confirma precio/envío en checkout, sin afirmar envío gratis.

## Política conservada

No se modifican funciones SQL, promociones, categorías, combos, precios ni datos Cloud. La base del carrito es Mercado Pago: no aplica descuentos de transferencia. Los tratamientos distintos que el SQL existente da a variantes promocionales, variantes sin promoción y combos permanecen vigentes. La confirmación por transferencia y el descuento del servidor conservan su comportamiento; esta iteración no redefine una política comercial.

| Unidades del fixture elegible | Mercadería cotizada | Envío gratis |
| --- | ---: | --- |
| 1 | ARS 10.000 | No |
| 2 | ARS 16.000 | No |
| 8 | ARS 64.000 | No |
| 10 | ARS 80.000 | Sí |

## Validación y transición

Los tests Node cubren el contrato aditivo, errores, selección 1→2→1 persistida en un adaptador HTTP aislado y rechazo de importes manipulados. El test PostgreSQL ejecuta funciones reales del repositorio en un contenedor y una base vacía exclusivos para pruebas; crea fixtures dentro de BEGIN/ROLLBACK y comprueba que no quedan tablas después. Cubre elegibilidad/no elegibilidad, combos legacy y variantes, transferencia conservada, cambio de precio antes de confirmar y rechazo por falta de stock.

Para publicar se necesita una aprobación posterior: primero actualizar el backend Staging y verificar el nuevo contrato, después construir y publicar manualmente el frontend mediante `--prebuilt`. El frontend anterior puede ignorar los campos aditivos. No se debe reutilizar el artefacto prebuilt de una publicación anterior. Los commits actuales permanecen locales; una eventual publicación de la rama también requiere autorización.
