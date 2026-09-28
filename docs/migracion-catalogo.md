# Migración del catálogo MateBreak

## Inspección y propuesta (28/09/2026, antes de importar)

Proyecto Supabase: `nwpdfqwqxrkokluqqqfs`. El esquema usa `producto`,
`producto_simple`, `combo` y `combo_item`. Tiene 11 insumos de inventario,
sin precio y desactivados para venta. No tiene categorías relacionales,
imágenes, variantes ni buckets. Se conservan los 11 registros y su stock.

Se amplía `producto` con origen, slug y moneda; se agregan relaciones de
catálogo, categorías jerárquicas, opciones, variantes, promociones e imágenes.
Las imágenes se guardan sin recomprimir, con hash SHA-256 para deduplicar.
Se conserva la descripción íntegra como texto; HTML de origen sólo para auditoría.
Los componentes descritos de combos se guardan con texto de evidencia y una
referencia opcional; sólo una correspondencia explícita permite `combo_item`.

El catálogo y el comercio operan en ARS desde la migración de variantes; no se
convirtieron importes. Stock desconocido permanece NULL. La disponibilidad
pública sólo habilita pedidos con relación explícita a inventario y stock.

El carrito tiene líneas de variantes con precios leídos en el servidor. La
confirmación de pedidos importados funciona para 41 variantes aprobadas; los
métodos de pago/envío siguen desactivados hasta la configuración comercial.

Se usarán restricciones únicas de origen, transacción por producto y RLS cerrada
al acceso directo. El servidor publica únicamente los campos de catálogo.
No se eliminan tablas, productos, pedidos ni movimientos existentes.
