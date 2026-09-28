# Criterio de interfaz de MateBreak

Decisión del usuario (9 de septiembre de 2026): conservar el diseño del inicio. El carrito y Mi cuenta **no llevan el encabezado de navegación del inicio**; muestran únicamente la misma marca, enlazada al inicio. No volver a introducir otra versión del logo ni una barra fija en estas dos pantallas.

- Logo original y palabra MateBreak®: `src/js/site-brand.js`; imagen idéntica a la del inicio, también presente en el HTML para que aparezca antes de cargar JavaScript.
- Tipografía de marca y títulos: Geist. Texto: Inter. Estilos de marca aislados en `src/css/site-brand.css`; conservar las tarjetas, colores y distribución existentes.
- La página principal conserva su encabezado, categorías y accesos a carrito/cuenta.
- Las mejoras funcionales deben conservar esta identidad. No rediseñar el inicio sin pedido explícito.

## Datos y filtros añadidos

- Administrador: nombre de registro, email, confirmación, rol, fecha de creación y último ingreso. Búsqueda y filtro por rol sobre la página actual (50 cuentas), con alcance indicado. Nombre de registro es un dato editable de presentación, nunca una fuente de permisos.
- Dashboard administrativa: abre con resultados comerciales de todas las ventas manuales del equipo y permite consultar este mes, 30 días, 90 días o todo el historial. Separa total registrado, entregado y pendiente; muestra clientes nuevos (primera venta dentro del período), anteriores (ya habían comprado) y recurrentes (más de una compra histórica), ranking por vendedor, evolución y actividad reciente. Los importes son ventas informadas por el equipo, no comprobantes fiscales ni cobros conciliados. Inventario queda como acceso secundario.
- Vendedor: búsqueda por cliente, teléfono, número de venta, producto o grabado; filtro por estado. Resumen de importes registrados, piezas y pendientes de entrega de los resultados (máximo 200 ventas cargadas). Esos importes no representan cobros verificados. Fechas y estado de reserva en cada venta.
- Cliente: búsqueda por número/producto y filtro por estado (últimos 100 pedidos); subtotal, unidades, fecha, vencimiento de reserva pendiente, información disponible de pago, transportista y seguimiento. Las direcciones muestran teléfono, país, código postal e indicaciones cuando existen. Actualizar pedidos no borra cambios sin guardar en Mis datos.

No se crearon campos comerciales ni movimientos ficticios para completar información ausente. No se cambiaron permisos, credenciales ni stock real. Los endpoints conservan autorización en servidor/Supabase y cada cliente/vendedor sigue viendo únicamente sus registros.

Validación: `npm test` incluye 30 pruebas, entre ellas ausencia de header en cuenta/carrito, coincidencia del logo, fuentes compartidas, filtros, totales y autorización de la dashboard. `tests/account-preview.mjs` permite probar cada rol con fixtures que no guardan operaciones.
