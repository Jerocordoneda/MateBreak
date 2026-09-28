# MateBreak

Para iniciar la aplicación completa, ejecutá `npm start` (Node 22+, con `.env` configurado).

- Inicio: http://localhost:3000/
- Mi cuenta: http://localhost:3000/mi-cuenta
- Carrito: http://localhost:3000/tienda#carrito

Usá `npm start`, no `npx serve` ni Live Server: la cuenta, el carrito y el inventario necesitan el backend de Node.
El puerto predeterminado es 3000. Pruebas: `npm test`.

Todas las cuentas nuevas son clientes. Desde Mi cuenta, el administrador ve la dashboard comercial de todo el equipo, gestiona usuarios/roles y accede al inventario; el vendedor registra sus ventas; el cliente consulta sus pedidos, guarda direcciones y accede a la tienda/carrito. Para compras reales todavía deben configurarse precios y métodos de pago/envío activos.

Ver [configuración y operación del comercio](docs/comercio.md) para Supabase,
pagos, envíos y reservas de stock.

Ver [criterio de interfaz y datos por rol](docs/interfaz.md): carrito y cuenta sin encabezado de navegación, siempre con el logo y tipografía del inicio.
