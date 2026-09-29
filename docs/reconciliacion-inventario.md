# Reconciliación de inventario — 29/09/2026

La fuente es el catálogo ya importado en Supabase; no se volvió a scrapear. El inventario representa piezas físicas sin grabar. El diseño, el equipo y el color del cuero no originan un SKU distinto. El producto vendido conserva sus opciones y personalización, y cada componente apunta al SKU físico compartido.

## Resultado

| Medida | Antes | Ahora |
| --- | ---: | ---: |
| Variantes con mapping aprobado | 47/217 | 131/217 |
| Variantes comprables con stock o a pedido | 47/217 | 131/217 |
| Productos con una variante comprable | 28/106 | 63/106 |
| Combos completos | 0/56 | 13/56 |

Se aprobaron 84 mappings nuevos desde los 47 iniciales: 49 mates con bombilla opcional, dos imperiales de calabaza con acabado negro, una bombilla suelta, una matera negra, dos termos con color explícito, 13 sets parrilleros y 16 termos de publicación individual cuya galería determina el color. Los 13 sets reservan el cuchillo y registran como obligación la tabla 20×30 cuando no hay unidades físicas disponibles. No se crea stock ficticio. `MB-BOM-PICO-LORO` se creó con disponible 0; posteriormente el equipo ingresó 2000 unidades mediante el ajuste común de inventario, sin costo de recepción registrado. Por eso las cifras de comprabilidad aumentaron también por una operación externa al mapping.

El [CSV de variantes](reconciliacion-variantes.csv) registra las 86 pendientes con evidencia y grupo. Se regenera con `npm run catalog:reconcile`; la herramienta sólo lee y reporta, nunca aprueba mappings.

## Decisiones agrupadas pendientes

| Familia | Variantes | Motivo | Decisión necesaria |
| --- | ---: | --- | --- |
| Sets materos y premium | 62 | Las galerías importadas muestran termo plateado en 60 variantes y negro en las dos del set Mundial 2026. La composición incluye una caja de regalo premium sin SKU. | Crear el SKU físico de la caja, con abastecimiento real. |
| Sets deluxe | 24 | Mate, tabla y cuchillo son identificables; la caja de regalo premium incluida no tiene SKU. | Crear el SKU físico de la caja y definir cómo se abastece. |

No se aprobó una composición parcial. La bombilla de los sets materos y premium ya tiene un único SKU compartido. La caja requiere definir si se controla por stock o puede prepararse a pedido; no se presupone ninguna de las dos opciones. Los sets parrilleros no incluyen caja según su composición importada. Ninguna publicación minorista requiere un selector de color: el producto publicado determina el termo físico.

## Evidencia de termos

Se revisaron 80 variantes con termo: 18 individuales (dos ya mapeadas) y 62 variantes de 31 sets. Títulos y descripciones no contradicen las galerías: 15 publicaciones individuales pendientes muestran cuerpo plateado y `TERMO PREMIUM MUNDIAL` cuerpo negro. Las galerías adicionales de cada termo individual mantienen el mismo acabado. En los sets, 30 productos muestran termo plateado y `SET MATERO MUNDIAL 2026` muestra negro; se compararon las dos imágenes de variante por producto. `SET PREMIUM DE BELGRANO` muestra solo el mate en su segunda imagen, pero la primera muestra el termo plateado y la descripción confirma que lo incluye. Los 16 termos individuales quedaron aprobados por `20260929122500_reconcile_thermo_publications.sql`, con evidencia de imagen de origen en cada componente. Los sets conservan la identidad del termo en el reporte pero siguen sin mapping aprobado porque falta la caja de regalo.

## Operación física

Cada recepción guarda cantidad, costo unitario ARS, fecha, actor, motivo y proveedor opcional, además del ajuste de existencias. Los costos de distintos lotes permanecen separados. El reintento con la misma clave de idempotencia no suma unidades de nuevo. Las piezas marcadas `a_pedido` pueden venderse sin stock disponible: checkout registra `pedido_abastecimiento`, y una recepción posterior asigna automáticamente las unidades a pedidos pagados en orden. El sistema no permite despachar mientras falten componentes físicos.

Los componentes que requieren grabado crean trabajos por línea de pedido. Después del pago pueden pasar por `pendiente_preparar`, `enviado_grabar`, `grabado_recibido` y `listo_despachar`; envío y entrega completan el flujo. Las bombillas no generan trabajo de grabado. La lista de administración agrupa piezas pendientes por SKU físico. El mismo identificador físico puede usarse más adelante desde un canal mayorista sin separar existencias; no se implementó ese canal.

`supabase/tests/physical-operations.sql` comprueba el flujo en una transacción con rollback, junto con variantes de distintos diseños que consumen un único SKU, bombilla opcional, termos negro/plateado separados y asignaciones parciales de dos recepciones al mismo pedido. `supabase/tests/thermo-publications.sql` prueba que una compra de dos publicaciones nuevas reserva ambos colores por separado, crea sus trabajos de grabado y deja cerrados los sets cuya caja carece de SKU.
