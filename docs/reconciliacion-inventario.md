# Reconciliación de inventario — 29/09/2026

La fuente es el catálogo ya importado en Supabase; no se volvió a scrapear. El inventario representa piezas físicas sin grabar. El diseño, el equipo y el color del cuero no originan un SKU distinto. El producto vendido conserva sus opciones y personalización, y cada componente apunta al SKU físico compartido.

## Resultado

| Medida | Antes | Ahora |
| --- | ---: | ---: |
| Variantes con mapping aprobado | 47/217 | 115/217 |
| Variantes comprables con stock o a pedido | 47/217 | 65/217 |
| Productos con una variante comprable | 28/106 | 46/106 |
| Combos completos | 0/56 | 13/56 |

Se aprobaron 68 mappings nuevos: 49 mates con bombilla opcional, dos imperiales de calabaza con acabado negro, una bombilla suelta, una matera negra, dos termos con color explícito y 13 sets parrilleros. Los 13 sets reservan el cuchillo y registran como obligación la tabla 20×30 cuando no hay unidades físicas disponibles. No se crea stock ficticio. Los mappings aprobados que hoy no son comprables dependen principalmente de recibir y contar bombillas físicas. `MB-BOM-PICO-LORO` fue creado con disponible 0; se carga exclusivamente mediante una recepción real.

El [CSV de variantes](reconciliacion-variantes.csv) registra las 102 pendientes con evidencia y grupo. Se regenera con `npm run catalog:reconcile`; la herramienta sólo lee y reporta, nunca aprueba mappings.

## Decisiones agrupadas pendientes

| Familia | Variantes | Motivo | Decisión necesaria |
| --- | ---: | --- | --- |
| Termos personalizados individuales sin color | 16 | Hay dos SKU físicos independientes, negro y plateado. La ficha no distingue cuál se entrega. | Incorporar selección de color a esas fichas. |
| Sets materos y premium | 62 | El termo incluido tampoco distingue color. Además, la composición importada incluye una caja de regalo premium sin SKU. | Definir selección de color del termo y crear el SKU físico de la caja, con abastecimiento real. |
| Sets deluxe | 24 | Mate, tabla y cuchillo son identificables; la caja de regalo premium incluida no tiene SKU. | Crear el SKU físico de la caja y definir cómo se abastece. |

No se aprobó una composición parcial. La bombilla de los sets materos y premium ya tiene un único SKU compartido, pero su cantidad inicial sigue pendiente de recepción física. La caja requiere definir si se controla por stock o puede prepararse a pedido; no se presupone ninguna de las dos opciones. Los sets parrilleros no incluyen caja según su composición importada.

## Operación física

Cada recepción guarda cantidad, costo unitario ARS, fecha, actor, motivo y proveedor opcional, además del ajuste de existencias. Los costos de distintos lotes permanecen separados. El reintento con la misma clave de idempotencia no suma unidades de nuevo. Las piezas marcadas `a_pedido` pueden venderse sin stock disponible: checkout registra `pedido_abastecimiento`, y una recepción posterior asigna automáticamente las unidades a pedidos pagados en orden. El sistema no permite despachar mientras falten componentes físicos.

Los componentes que requieren grabado crean trabajos por línea de pedido. Después del pago pueden pasar por `pendiente_preparar`, `enviado_grabar`, `grabado_recibido` y `listo_despachar`; envío y entrega completan el flujo. Las bombillas no generan trabajo de grabado. La lista de administración agrupa piezas pendientes por SKU físico. El mismo identificador físico puede usarse más adelante desde un canal mayorista sin separar existencias; no se implementó ese canal.

`supabase/tests/physical-operations.sql` comprueba todo lo anterior en una transacción con rollback, junto con variantes de distintos diseños que consumen un único SKU, bombilla opcional, termos negro/plateado separados y asignaciones parciales de dos recepciones al mismo pedido. También pasaron los ocho tests SQL anteriores y `npm test` (35/35).
