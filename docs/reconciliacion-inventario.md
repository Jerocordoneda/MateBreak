# Reconciliación de inventario — 29/09/2026

El inventario representa piezas físicas sin grabar. Los diseños publicados comparten el SKU base y la caja para mate es un insumo interno: no es una publicación, no tiene precio y el cliente no la elige. Tampoco elige el color del termo; la publicación minorista determina el SKU negro o plateado.

## Estado actual

| Medida | Resultado |
| --- | ---: |
| Variantes con mapping completo aprobado | 217/217 |
| Variantes comprables con las existencias actuales | 33/217 |
| Productos con una variante comprable | 33/106 |
| Combos con composición completa | 56/56 |
| Variantes pendientes de decisión | 0 |

`MB-CAJA-MATE` se creó con **0 unidades** y abastecimiento por stock. Administración debe registrar la cantidad física real mediante **Inventario → Recibir** o conteo; hasta entonces, ninguna variante que incluya mate puede pasar checkout. Esto es la consecuencia deliberada de que cada mate requiere una caja. Los 13 sets parrilleros, que no contienen mate, no consumen cajas y siguen comprables; las tablas continúan como insumo a pedido.

Se aprobaron 86 mappings de variantes de combos en esta iteración: 24 deluxe, 38 materos y 24 premium. Todas sus piezas se relacionaron con SKU físicos existentes. Los termos son plateados salvo las dos variantes de `SET MATERO MUNDIAL 2026`, cuyo termo negro se ve en la galería importada; títulos y descripciones no lo contradicen. Ninguna variante permite al cliente elegir color. Sumados a los mappings anteriores, quedan 217 aprobados.

La regla central de componentes incorpora automáticamente **una caja por unidad de mate físico** en cada variante. Si un combo tiene dos mates, registra dos cajas; si no tiene mates, cero. La fila de caja se recalcula al insertar, modificar o quitar componentes físicos y no genera otra caja por tratarse de un combo. El checkout conserva su agregación server-side, bloqueo e idempotencia y reserva mate y caja en la misma transacción. Las ventas manuales del vendedor descuentan el mismo SKU de caja, mantienen su reserva y registran la entrega sin descontarla dos veces.

## Cuchillo y vaina

El equipo confirmó que todos los cuchillos incluyen su vaina. `MB-CUC-INOX` representa ambos como una sola unidad de inventario, sin SKU adicional para funda o vaina. Esto resolvió las dos variantes de `SET PREMIUM PERSONALIZADO - TU PROPIO DISEÑO`. No quedan decisiones de mapping pendientes.

Su termo está identificado como plateado; no quedan casos de termo pendientes por color. Los 56 combos tienen composición física completa. El [CSV de variantes pendientes](reconciliacion-variantes.csv) se regenera con `npm run catalog:reconcile` y no aplica mappings.

Las migraciones `20260929130000_box_per_mate_and_combo_mapping.sql` y `20260929131500_box_for_manual_sales.sql` implementan la regla de cajas sin crear stock inicial positivo. `20260929133000_map_premium_personalized_knife_sheath.sql` completa los mappings con la vaina incluida en el cuchillo. `supabase/tests/box-per-mate.sql` cubre recepción con costo, falta de caja, multiplicación por cantidad, carrito mixto, productos sin mate, cuchillo con vaina, venta manual, precio server-side e idempotencia. Los fixtures de pruebas anteriores que compran mates cargan cajas temporalmente dentro de transacciones con rollback.
