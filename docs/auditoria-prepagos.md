# Auditoría previa a pagos — 28/09/2026

Verificación en el proyecto Supabase configurado: 106 productos, 217 variantes publicadas, 217 mappings aprobados, 56 combos completos y 1.000 cajas. Todas las variantes y productos resultaron comprables al momento de la consulta. Los métodos comerciales reales continúan desactivados; las pruebas de checkout habilitan transferencia y retiro solo dentro de transacciones con `rollback`.

Pruebas reproducibles en `supabase/tests/`:

- `catalog-integrity.sql`: precios ARS, mappings, cantidades, SKU existentes, combos y una caja por mate físico.
- `prepayment-cart.sql`: carrito anónimo, vinculación al iniciar sesión, variantes, cantidades, combinación con set y eliminación.
- `prepayment-e2e.sql`: once publicaciones representativas, cotización server-side, pedido, snapshots, reservas exactas, idempotencia y cancelación con devolución.
- `prepayment-stock-expiration.sql`: falta de mate, caja o cuchillo; fallo atómico del combo; límites exactos y vencimiento idempotente.
- `prepayment-receipts.sql`: ingresos de 100 y 50 unidades, costos ARS de 10.800 y 12.000, historial, actor, fecha y motivo.
- `prepayment-preparation.sql`: mate y termo grabables, bombilla y caja sin grabado, pago simulado dentro del rollback, lista operativa, transiciones y bloqueo del despacho anticipado.
- `box-per-mate.sql` y las pruebas previas: cantidades multiplicadas, dos mates en un set, carrito mixto, ventas manuales y aislamiento de roles.

`npm test` incluye una prueba adicional que envía precio, total, identidad, rol, variante, SKU y componentes falsificados al endpoint de checkout y comprueba que el servidor solo remite las elecciones permitidas y la identidad verificada. Las pruebas SQL verifican que la base vuelve a calcular precio, composición y stock.

El smoke test de navegador cargó inicio, categoría, producto, carrito, cuenta de administrador e inventario sin errores críticos de consola. La imagen principal de la publicación probada respondió HTTP 200. Los endpoints públicos de sesión, catálogo, categorías, carrito y métodos respondieron 200; perfil, direcciones, pedidos, inventario y ventas devolvieron 401 sin autenticación.

Límites comprobados:

- `MB-QUENCHER` es un SKU de inventario de 70 unidades, pero no tiene una publicación entre los 106 productos; por tanto, no existe compra minorista de Quencher para ensayar. Lo mismo aplica a `MB-MAT-ACE` y `MB-YERBERA`. Esta auditoría no publicó productos ni inventó precios.
- El checkout real en navegador no puede llegar a pedido mientras pago y retiro estén desactivados. El recorrido transaccional sí se probó con fixtures temporales.
- La lógica de checkout toma el bloqueo global `pg_advisory_xact_lock(782204,1)` y verifica `stock >= cantidad`; las pruebas de límite y rollback pasaron. No se pudo demostrar una carrera real de dos checkouts en paralelo sobre una última unidad sin comprometer stock o dejar pedidos en la base de producción. Esa prueba requiere una base aislada de ensayo.

No se integró Mercado Pago ni se modificaron métodos reales, usuarios, stock o pedidos persistentes.
