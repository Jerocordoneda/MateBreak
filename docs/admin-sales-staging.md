# Panel comercial y costos (Staging)

Inventario presenta únicamente el acceso «Abrir control y movimientos»; los costos se consultan y cargan en las recepciones del control existente.

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

## Ajustes de cuenta y navegación

Registro: Nombre, Apellido, Teléfono / WhatsApp, Provincia, Localidad, Email, Contraseña y Confirmación. La validación reúne los campos incorrectos, los marca junto a sus mensajes y conserva los datos. Para credenciales rechazadas, inicio de sesión indica email o contraseña incorrectos sin revelar si una cuenta existe. El servidor comparte la validación de datos; la confirmación de contraseña es una comprobación del formulario.

El formulario de ventas conserva el motivo específico de un rechazo; un fallo de transporte o de servidor reintenta una sola vez con la misma clave idempotente. Un rechazo 4xx no se reintenta automáticamente. No se afirma que una venta se guardó si el servidor la rechazó.

Submenús: se elimina la traslación independiente de Tailwind que desplazaba el panel; en desktop aparecen debajo y a la derecha. La flecha cambia al abrir, cerrar, cambiar de grupo o usar Escape.

Validación adicional: 346 pruebas Node, 261 mediciones de header, nueve tamaños/navegaciones y pruebas de orden del registro, errores simultáneos, rechazo de credenciales, recuperación automática y rechazo por stock.

## Accesorios explícitos en ventas del vendedor

Las ventas manuales reservan únicamente los productos agregados por el vendedor: no incluyen una caja automática por mate. Cajas y bombillas se agregan como líneas de producto cuando corresponde. El checkout minorista conserva sus reglas de empaque. Las reservas de cajas históricas permanecen hasta su entrega; no se modifican retroactivamente.

Por indicación del usuario se realizó un conteo auditado de 1.000 cajas físicas en Staging, conservando las 21 reservas existentes: 979 disponibles. El costo se mantiene sin confirmar; no se creó una recepción con costo cero.
