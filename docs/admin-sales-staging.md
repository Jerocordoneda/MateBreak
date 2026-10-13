# Panel comercial y costos (Staging)

Las cinco secciones de Mi cuenta son independientes: Dashboard, Roles, Inventario, Solicitudes mayoristas y Pedidos minoristas. Se conservan los permisos, estados, pagos y operaciones de stock existentes. La navegación conserva el hash, el historial del navegador y el selector de período.

## Ventas y stock

El formulario confirma el guardado y el resultado del stock. Se conserva la clave idempotente cuando una respuesta falla: reintentar la misma venta no duplica ventas, reservas ni egresos. Por grabar / por entregar reservan las piezas; entregada consume las piezas. La entrega de una reserva no vuelve a descontar disponibilidad.

Dashboard e inventario consultan sus APIs autorizadas cada 15 segundos mientras el panel administrador está visible, y al recuperar el foco. Esto funciona entre cuentas y dispositivos diferentes. Las solicitudes en curso se protegen de respuestas fuera de orden; la actualización de inventario conserva los costos que un operador está editando.

## Costo utilizado

Se reutiliza el costo unitario ARS de inventario_recepcion. El costo vigente inicial se obtiene de la última recepción por fecha, luego fecha de registro e identificador para desempatar. Los próximos ingresos actualizan este costo sin cambiar las reglas de recepción o stock. Se permite una corrección administrativa del costo con motivo, control de concurrencia, idempotencia y auditoría, sin inventar un ingreso físico.

Cada nueva línea de venta conserva el costo vigente en una instantánea dentro de la misma transacción de registro. Cambios de costo futuros no modifican ventas anteriores. El criterio es costo de la última recepción, no FIFO ni promedio ponderado.

Las ventas históricas no se rellenan con el costo actual: eso alteraría datos históricos sin evidencia. Si alguna línea no tiene costo, la facturación neta dice Sin calcular y muestra cuántas unidades carecen de costo histórico. Un costo cero solo es válido cuando fue registrado explícitamente.

Se verificó en Staging la recepción existente MB-CAM-ALG: 300 camioneros a $5.500 cada uno. La migración solo reutiliza su costo; no crea otra recepción ni modifica sus unidades.

## Seis KPI

El selector conserva mes actual, 30 días, 90 días y todo el historial. La fecha de registro de venta define el período con los límites del servidor; el estado actual se refleja en ese período original. Fuente: ventas manuales del equipo. Los pedidos minoristas se consultan aparte para no sumar datos de distinto circuito ni duplicar cierres mayoristas.

| KPI | Cálculo |
| --- | --- |
| Facturación entregada | Suma del importe final de las ventas del período actualmente entregadas. |
| Facturación neta | Suma de los importes finales vendidos, incluidas las pendientes, menos cantidad × costo unitario conservado por línea. Si falta un costo, no se muestra un neto incompleto. No incluye impuestos, costos de embalaje fuera de la línea ni gastos operativos. |
| Pendiente de entrega | Suma del importe final de ventas por grabar o por entregar. |
| Clientes | Clientes únicos del período: teléfono normalizado; si falta, nombre normalizado. Los homónimos sin teléfono pueden agruparse. |
| Clientes recurrentes | Clientes del período con más de una venta en todo el historial, independientemente del estado. |
| Ticket promedio | Facturación entregada / cantidad de ventas entregadas; cero cuando no hay entregadas. |

Los importes son información comercial de ventas registradas, no conciliación de cobros bancarios.

## Validación

- Build de Staging y build precompilado Vercel.
- 342 pruebas de Node existentes.
- Pruebas históricas account-sales.sql y admin-dashboard.sql intactas, ejecutadas y revertidas en PostgreSQL aislado.
- Playwright con Chrome, APIs reales del repositorio y PostgreSQL local: recepción de costos, guardado y replay, corrección de costos, concurrencia, permisos, reservas, entrega sin doble descuento, rechazo de sobreventa, costo histórico y refresco entre dos sesiones.
- Las cinco secciones sin overflow en 320, 360, 375, 390, 414, 430 y 1440 px; capturas mobile/desktop. Los datos de las capturas son fixtures locales, no ventas fabricadas en Staging.
- 26 migraciones históricas intactas; migración de costos aditiva.
