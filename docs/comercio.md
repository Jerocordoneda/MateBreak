# Comercio de MateBreak2

Proyecto: `nwpdfqwqxrkokluqqqfs`. El catálogo existente se conserva.

## Implementado

- `perfil` se vincula a `auth.users`. Supabase Auth administra contraseñas y sesiones.
- `direccion` permite varias direcciones privadas por cliente.
- `carrito` y `carrito_item`: cookie aleatoria de 256 bits, hash SHA-256 en la base, vencimiento de 30 días. El servidor establece HttpOnly, SameSite=Lax y Secure en HTTPS. El carrito anónimo se vincula al ingresar; no se fusionan carritos de diferentes dispositivos.
- `pedido` y `pedido_item`: precios, nombre, moneda y dirección históricos; clave de idempotencia por usuario y un pedido por carrito.
- `pedido_stock` y `movimiento_stock`: reserva transaccional de componentes simples, incluso cuando también se compran dentro de combos. Cancelar devuelve exactamente el stock reservado.
- `metodo_pago`, `pago`, `metodo_envio`, `envio`: estados separados, referencias de pago y seguimiento.
- RLS en todas las tablas nuevas. Solo el servidor puede modificar carritos, pedidos, pagos e inventario. Perfil y direcciones también usan RLS desde el servidor con el token verificado del cliente.
- La API valida el usuario con `getUser()`. Ningún precio, importe, estado de pago o usuario enviado por el navegador se considera autoridad.
- Cookie de Supabase Auth administrada por `@supabase/ssr`, solo desde el servidor. Los tokens no se devuelven al JavaScript del navegador.

## Arranque

1. El entorno local ya tiene `.env` configurado. Para otro entorno, copiar `.env.example` y completar `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`. También se aceptan las variables existentes `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. La clave secreta es exclusivamente del servidor: no ponerla en HTML, JavaScript público ni repositorios.
2. Configurar en Supabase Auth la URL del sitio y permitir `APP_ORIGIN/auth/callback`. El origen local predeterminado es `http://localhost:3000`.
3. Ejecutar `npm install` y `npm start`. Abrir `http://localhost:3000/tienda`.
4. Para producción, usar un servidor Node persistente y HTTPS, `NODE_ENV=production` y `APP_ORIGIN` con el dominio exacto. La página estática por sí sola no puede ejecutar este backend.

La migración `supabase/migrations/20260907203438_commerce.sql` corresponde a los cambios aplicados en el panel de MateBreak2. No ejecutarla de nuevo sobre ese mismo esquema. Se aplicó por SQL Editor en dos transacciones (tablas y funciones); no se registró automáticamente en `supabase_migrations`. Antes de usar `db push`, reconciliar la migración con el historial remoto tras verificar el esquema.

La migración adicional `20260907205528_restrict_rls_event_function.sql` restringe las llamadas directas a `rls_auto_enable()`, una función interna preexistente señalada por los asesores. Conserva su uso como event trigger.

## Configuración comercial pendiente

Los métodos arrancan desactivados a propósito. Cargar la cuenta bancaria e instrucciones reales antes de activar transferencia; habilitar retiro solo después de definir cómo se coordina. Crear las tarifas y cobertura de envío reales en `metodo_envio`. El modelo inicial admite tarifa fija por método y país, no cotizaciones por departamento/peso.

Mercado Pago está registrado como opción desactivada. No se implementó integración con su API, checkout alojado ni webhook: requiere elegir proveedor y configurar credenciales. Nunca activar ese método hasta completar la integración. No se guardan tarjetas.

Un operador de confianza puede confirmar una transferencia desde SQL Editor:

```sql
select public.mb_confirmar_pago('<pago_uuid>', '<referencia_bancaria_unica>', 1500.00, 'ARS');
```

Debe verificar el ingreso real antes de ejecutar. Para un proveedor online, un webhook futuro debe verificar firma, consultar el pago al proveedor y comprobar referencia, importe, moneda y pedido antes de llamar a la función. El comprador no tiene acceso a esta operación.

Secuencia de preparación y envío, también exclusiva del operador:

```sql
select public.mb_actualizar_envio('<pedido_uuid>', 'preparando');
select public.mb_actualizar_envio('<pedido_uuid>', 'enviado', 'Transportista', 'Seguimiento');
select public.mb_actualizar_envio('<pedido_uuid>', 'entregado');
```

El retiro utiliza estos mismos estados. Desde la incorporación del inventario físico, `enviado` significa que las piezas ya salieron del depósito: entregadas al transportista o retiradas por el comprador. No marcar como enviado un retiro que solo está listo para entregar. Reembolsos y devoluciones requieren conciliación manual: no hay integración automática.

## Reservas y operación

El checkout reserva stock durante 24 horas. `server/index.mjs` libera reservas vencidas al arrancar y cada minuto. Si el servidor está detenido, la liberación espera hasta el próximo arranque. Para producción puede programarse `select public.mb_expirar_reservas()` mediante Supabase Cron; no quedó programado en la base. La función usa lotes de 100 y bloqueo de filas; una confirmación tardía se rechaza y exige conciliación manual.

La cancelación conserva el pedido y sus datos históricos. No elimina registros. El carrito confirmado no se reutiliza; la próxima lectura emite otra cookie.

El limitador HTTP en memoria es apropiado para un solo proceso. Usar uno compartido y configurar el proxy de confianza antes de operar varias réplicas. Los correos dependen de Supabase Auth/SMTP, que no se modificó.

## Validación

`npm test`: cookies, aislamiento del usuario, origen de peticiones, campos permitidos y protección de archivos privados.

`supabase/tests/commerce.sql`: prueba con rollback de stock de combos, idempotencia, falta de stock, cancelaciones, confirmación de pago, envío y RLS. Ejecutar como postgres en SQL Editor. Sus fixtures no se conservan.

La prueba de HTTP usa dobles de Supabase; no sustituye la prueba final de registro, correo, login y compra desde la web con las claves y los métodos reales configurados.

Se ejecutó además `node --env-file=.env tests/integration.mjs` contra MateBreak2: login/logout reales, conservación del carrito anónimo, perfil y aislamiento de direcciones. Las dos cuentas temporales se eliminaron al terminar, sin enviar correos. También se verificaron HTTP 200 para catálogo, carrito, sesión, métodos y la pantalla `/tienda`. En ese momento el catálogo tenía cero productos.

Referencias consultadas: [SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [funciones](https://supabase.com/docs/guides/database/functions), [seguridad de Data API](https://supabase.com/docs/guides/api/securing-your-api).

## Interfaz

`/tienda#carrito` abre el carrito; las demás secciones son `#catalogo`, `#cuenta` y `#pedidos`. La interfaz mantiene el estilo oscuro/cobre de MateBreak, usa un resumen lateral en escritorio y una columna en móvil. Tiene estados vacío, carga y error; botones de cantidad; total estimado con el envío; y dirección condicional. Durante cada cambio se bloquean los controles para evitar solicitudes simultáneas. Los importes finales siguen calculándose en la base.

Prueba visual aislada: `node tests/preview.mjs` sirve fixtures en memoria en `http://localhost:3002/tienda`. No conecta a Supabase ni permite comprar. Se revisaron los estados vacío y con productos, la navegación a cuenta, los botones de cantidad y el cambio de entrega a 390 px y en escritorio. Esa vista previa no forma parte del servidor de producción.

## Inventario interno (08/09/2026)

Panel conectado: `http://localhost:3000/interno/inventario`. Iniciar sesión primero en `/tienda#cuenta`. No existe enlace en la navegación pública. El HTML, JS, CSS y todas las API internas requieren sesión verificada y pertenencia activa al equipo; conocer la dirección no permite acceder. No hay garantía de que un sistema sea “inhackeable”: se aplican controles de autorización reales y defensa en profundidad.

Se habilitó la cuenta existente y confirmada que indicó el usuario: `jerocordoneda@gmail.com`. Este rol permite consultar y ajustar inventario; no administrar usuarios, conceder permisos ni aprobar pagos. La pertenencia se comprueba en cada solicitud y otra vez dentro de la función SQL. No se utiliza `user_metadata` para autorizar.

Se cargaron 11 productos base, con 5.354 unidades aproximadas: imperial calabaza 1.200, imperial algarrobo 1.200, camionero algarrobo 700, mate acero 700, termo negro 800, termo plateado 24, cuchillo inoxidable 500, matera 60, Quencher 70, yerbera 100, tabla 0 (fabricación a pedido). Todos quedan inactivos y con precio NULL; no se pueden publicar sin definir precio. Los materiales desconocidos se dejaron como “Por confirmar”.

Cada SKU corresponde a una pieza física, no a un diseño grabado. La futura personalización debe guardarse en el pedido y compartir el producto base. Aún no se agregó un selector de diseños ni un flujo de órdenes al grabador.

### Significado de las cantidades

- Disponible: `producto_simple.stock`, unidades libres para nuevos pedidos.
- Reservado: suma de `pedido_stock` de pedidos pendientes de pago, pagados o en preparación.
- Físico: disponible + reservado todavía en depósito. Al enviar, las piezas dejan de contarse como físicas, sin descontar nuevamente el disponible.
- Ingreso: suma unidades recibidas al disponible.
- Egreso: retira unidades libres por rotura, pérdida u otro motivo. Nunca consume reservas.
- Conteo: reemplaza el total físico por el contado y calcula disponible = contado − reservado. Rechaza contar menos que lo reservado y quita la etiqueta “Aproximado”.

Un producto “a pedido” no genera stock ni habilita ventas sin existencias. Registrar la recepción del carpintero como ingreso. El mínimo genera una alerta si el disponible queda por debajo; el stock cero también alerta, salvo fabricación a pedido.

### Protección y trazabilidad

`private.equipo_inventario`, `private.inventario_ficha` y `private.inventario_ajuste` tienen RLS y no son accesibles con las claves públicas. El servidor solo puede leer membresías y agregar/leer ajustes: no concederse permisos, borrar ni reescribir el historial. Un operador postgres de confianza conserva sus facultades administrativas. Las API públicas del catálogo no devuelven existencias.

Cada ajuste exige cantidad válida, motivo, UUID idempotente y los valores de stock/reserva vistos por el administrador. Si otro proceso cambió las cantidades, debe actualizar y revisar antes de guardar. Reintentos idénticos devuelven el ajuste ya realizado. Se registran responsable, fecha, tipo, motivo, cantidad anterior/nueva y diferencia; el panel también muestra reservas/liberaciones del sistema de pedidos (últimos 200 movimientos). Las notas y umbrales no alteran cantidades y no forman parte del historial de ajustes.

Los ajustes, checkout, cancelaciones, confirmación de pago, vencimientos y envíos comparten un bloqueo transaccional de inventario antes de tomar otros bloqueos. Evita carreras entre un conteo y una reserva/salida. Es un bloqueo global sencillo, apropiado para este volumen; serializa también las operaciones de `mb_comercio`. Revisarlo antes de escalar a muchos pedidos simultáneos.

Para dar acceso a otra cuenta confirmada, exclusivamente desde SQL Editor y con autorización explícita del equipo:

```sql
insert into private.equipo_inventario(usuario_id)
select id from auth.users
where lower(email)=lower('EMAIL_AUTORIZADO') and email_confirmed_at is not null
on conflict(usuario_id) do update set activo=true;
```

Para revocar sin borrar la auditoría:

```sql
update private.equipo_inventario set activo=false
where usuario_id in (select id from auth.users where lower(email)=lower('EMAIL_A_REVOCAR'));
```

No publicar la service-role key, habilitar el esquema private en la Data API ni agregar políticas de lectura pública. HTTPS es obligatorio en producción; se aplica no-store, protección de origen/CSRF, CSP para el panel y cookies HttpOnly. El asesor de Supabase no señaló errores de RLS; sus avisos informativos de “RLS sin políticas” son intencionales para tablas exclusivas del servidor. Sigue pendiente activar [protección contra contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), según disponibilidad del plan. También se recomienda MFA para cuentas del equipo; no se configuró MFA ni se cambiaron credenciales.

### Migraciones y pruebas

`20260908093541_inventory_admin.sql` y `20260908094753_inventory_query_aliases.sql` se aplicaron remotamente con el conector Supabase. El segundo archivo corrige alias SQL ambiguos respecto de variables PL/pgSQL. El historial remoto puede tener timestamps distintos de los archivos creados con CLI: reconciliar por nombre/contenido antes de `db push`, junto a las migraciones anteriores aplicadas por SQL Editor.

`npm test` incluye 12 pruebas HTTP: acceso anónimo/cliente, metadatos falsificados, verificación fallida, protección de assets, autorización con identidad verificada, validación y CSRF, además del carrito. `supabase/tests/inventory.sql` usa fixtures transaccionales y rollback para comprobar listado, ajustes, reintentos, concurrencia optimista, reservas, conteos, stock cero, auditoría, envíos y revocación. Las pruebas de inventario y comercio se ejecutaron contra MateBreak2 sin conservar fixtures. `tests/integration.mjs` también comprueba que una cuenta real de cliente obtiene 403 al intentar leer el inventario; sus cuentas temporales se eliminan sin enviar correos.

Vista aislada: `node tests/inventory-preview.mjs`, puerto 3003, solo loopback. Usa datos en memoria, NO conecta a Supabase y NO se ejecuta con `npm start`. Cualquier ajuste en esa demostración no modifica el inventario real.

Se verificaron visualmente el formulario de conteo, el guardado con historial, la búsqueda y la vista móvil de tarjetas a 390 px. En la demostración se ingresaron 100 imperiales y se confirmó un conteo de termos; esos movimientos no se trasladaron a Supabase. La comprobación final del stock real devolvió 11 artículos, 11 movimientos iniciales y 5.354 unidades.

## Mi cuenta, roles y ventas del vendedor

El acceso principal es ahora `/mi-cuenta`, desde el icono de persona a la derecha del carrito en el inicio y en las páginas de productos. `/tienda#cuenta` redirige a esta pantalla por compatibilidad. El carrito muestra la suma de unidades, no el número de pedidos: 2 mates + 1 termo = 3. `/api/carrito/resumen` consulta el carrito existente sin generar cookies ni crear carritos desde la página de inicio; el contador se sincroniza al editar y al regresar a una pestaña.

La pantalla de cuenta incluye acceso y registro separados, mostrar/ocultar contraseña, un diseño de dos columnas en escritorio y formularios adaptados a móvil. Los permisos provienen de `mb_rol`, una consulta exclusiva del backend a membresías privadas; no se reciben desde formularios ni metadatos editables.

- Administrador: resumen de disponible/físico/reservado, acceso al inventario y gestión de usuarios/roles. Se conserva `jerocordoneda@gmail.com`.
- Vendedor: formulario de ventas, grabados solicitados y seguimiento de sus propias ventas. Se creó y habilitó `santicasinelli@gmail.com` con la contraseña indicada por el usuario, sin guardarla en archivos del proyecto.
- Cliente: accesos a tienda/carrito, historial de sus últimos 100 pedidos con detalle de productos, pago y entrega, perfil, direcciones y emails de contacto propios. Los registros nuevos son clientes por defecto.

El email de acceso se muestra como solo lectura. Los emails adicionales son contactos guardados, no identidades verificadas ni un mecanismo para cambiar la cuenta de Auth. La tabla `email_contacto` protege lectura, alta y eliminación con RLS de propietario.

### Ventas y grabados

`private.venta_manual`, `venta_manual_item` y `venta_manual_evento` conservan ventas, piezas, precios históricos, personalización y cambios de estado. El vendedor solo consulta sus registros (hasta 200, pendientes primero) y una lista de nombres/SKU/precios para elegir artículos. No puede leer existencias exactas, consultar ventas ajenas, editar inventario, concederse permisos ni cambiar el precio del catálogo.

El vendedor informa el precio unitario efectivamente vendido en ARS. La base calcula el total con decimales exactos. El medio de pago es informativo: no cobra tarjetas, verifica transferencias ni aprueba pagos online. Señas y referencias pueden anotarse en las notas.

## Variantes del catálogo

`20260928210316_ars_variant_checkout.sql` fija ARS sin convertir importes y relaciona cada variante aprobada con uno o más SKU de `producto_simple` mediante `catalogo_variante_mapeo` y `catalogo_variante_componente`. Sólo se aprobaron 41 variantes cuyo modelo y ausencia de bombilla permiten identificar el insumo físico a partir del catálogo y de este documento. Las 176 restantes siguen publicadas y requieren revisión manual; ningún set importado tiene todavía composición física completa aprobada.

La ficha indica si la variante puede comprarse y si tiene stock. El carrito conserva variantes y personalización; el checkout calcula en SQL el precio de la variante, el importe por transferencia y la promoción documentada del 20% al comprar dos o más mates personalizados de esa categoría. Cada variante genera su propia línea de pedido. La reserva suma todos los insumos físicos de las líneas, toma el bloqueo global de inventario y vence a las 24 horas. La clave de idempotencia evita duplicar pedido o reserva. El navegador puede consultar una cotización, pero el checkout recalcula todo dentro de la transacción.

Para revisar las pendientes sin activar stock por similitud de nombre:

```sql
select p.nombre, cv.id as variante_id, cv.opciones
from public.catalogo_variante cv
join public.producto p on p.id_producto=cv.producto_id
left join public.catalogo_variante_mapeo m on m.variante_id=cv.id
where cv.vigente and m.variante_id is null
order by p.nombre, cv.id;
```

Los métodos de pago y envío continúan desactivados en producción hasta que se definan datos bancarios, coordinación de retiro y cobertura/tarifas. Para el siguiente paso, un pedido `pendiente_pago` puede iniciar un pago de Mercado Pago exclusivamente desde el servidor; el webhook debe verificar firma, referencia, importe y moneda antes de llamar a `mb_confirmar_pago` y pasar el pedido a `pagado`.

Estados: `por_grabar` → `por_entregar` → `entregada`. Registrar una venta pendiente descuenta el disponible y suma una reserva; el físico permanece igual. Registrar una venta ya entregada descuenta el disponible y el físico directamente. Al confirmar la entrega de una venta pendiente, se quita su reserva sin volver a descontar el disponible. Los diseños se guardan por línea; varias líneas con diseños distintos comparten el mismo producto base.

Las operaciones toman el mismo bloqueo que checkout e inventario, validan stock, registran ajustes y eventos, y usan UUID idempotente para que un reintento no duplique ventas. Si falta stock en cualquier línea, se revierte toda la operación. Las reservas de ventas manuales no vencen automáticamente: se mantienen hasta la entrega. No existe anulación ni reembolso de estas ventas desde el panel del vendedor; una corrección comercial requiere revisión administrativa. No corregir una reserva pendiente agregando unidades al inventario.

La entrega queda registrada en el historial del inventario como salida de unidades previamente reservadas con diferencia disponible cero. Los conteos físicos incorporan reservas tanto de pedidos online como de ventas manuales.

La vía habitual para habilitar otro vendedor o administrador es **Mi cuenta → Usuarios y roles** con una cuenta administradora. Seleccionar el rol junto al email y pulsar Guardar. El destinatario debe haber confirmado su email para recibir permisos del equipo. La lista está paginada en grupos de 50 cuentas. No se muestran contraseñas ni metadatos de Auth.

Solo para mantenimiento excepcional desde SQL Editor (fuera de la auditoría del panel):

```sql
insert into private.equipo_vendedores(usuario_id)
select id from auth.users where lower(email)=lower('EMAIL_AUTORIZADO') and email_confirmed_at is not null
on conflict(usuario_id) do update set activo=true;
```

Para revocar desde el panel, seleccionar Cliente. Si una cuenta pertenece a ambos equipos por mantenimiento manual, prevalece administrador. El panel mantiene los roles excluyentes. Los clientes y vendedores no pueden acceder a los endpoints `/api/admin/usuarios`; tampoco ejecutar `mb_admin_roles` directamente.

### Registro y gestión de accesos

El registro ahora solicita nombre y apellido, email, contraseña (10–128 caracteres) y confirmación de contraseña. No incluye selector de rol. El backend acepta únicamente el nombre como dato de presentación en Auth; ignora roles y metadatos adicionales enviados por el navegador. `mb_rol` devuelve cliente cuando no existe una membresía interna activa, incluso si el usuario modifica sus propios metadatos. El nombre del registro se muestra en Mis datos y puede guardarse en el perfil.

Se distingue confirmación pendiente de sesión inmediata según la respuesta de Supabase. La pantalla de confirmación evita afirmar que se creó una cuenta cuando Auth devuelve una respuesta de protección contra enumeración de emails. El enlace de confirmación PKCE debe abrirse en el mismo navegador del registro; un enlace inválido muestra una explicación.

Migración `20260909000858_account_admin_roles.sql`, aplicada a MateBreak2: `private.cambio_rol` registra actor, destinatario, rol anterior/nuevo y fecha. El servidor usa la identidad verificada, el RPC vuelve a comprobar el administrador y serializa los cambios. Se rechazan roles desactualizados y cambios al propio rol. No se asignaron nuevos permisos a personas durante esta implementación. La auditoría no permite UPDATE/DELETE al servicio. Todas las tablas privadas mantienen RLS y acceso cerrado a anon/authenticated.

Pruebas de esta mejora: 24 pruebas HTTP locales; `supabase/tests/admin-roles.sql` pasó en una transacción con rollback (cliente por defecto, elevación indebida, asignación/revocación, datos desactualizados y auditoría). La integración real comprobó sesiones, perfil, direcciones privadas y pedidos, y eliminó sus cuentas temporales sin enviar emails. Revisión visual en escritorio y 390 px del registro, historial y gestión del equipo. Los asesores no introdujeron advertencias nuevas; permanece el aviso previo de [contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) desactivado. RLS sin políticas en tablas exclusivas del backend es intencional.

Los enlaces de compra usan el carrito/checkout existente. No se activaron productos sin precio ni métodos de pago/envío: para habilitar compras reales falta completar esa configuración comercial, tal como estaba previsto. El panel administrativo de esta entrega gestiona inventario y roles; no incorpora confirmación de pagos, reembolsos ni edición comercial del catálogo.

Migración aplicada: `20260908103049_account_roles_sales.sql`. `supabase/tests/account-sales.sql` verifica roles, contactos privados, totales, reservas, entrega, reintentos, propiedad y auditoría en una transacción con rollback. También pasaron los regresivos de inventario/comercio y 17 pruebas HTTP. La integración con Auth real comprueba emails propios, direcciones, login/logout y denegación del inventario a clientes.

Prueba visual aislada: `node tests/account-preview.mjs`, solo loopback en puerto 3004. `/demo/cliente`, `/demo/vendedor` y `/demo/administrador` muestran fixtures sin guardar operaciones. No integra el servidor normal. Se revisaron cuenta de administrador real, cliente/vendedor de prueba, edición de dirección, contador de 3 unidades y total de venta de 2 × 1500 = 3000. Se corrigió el encabezado del inicio para mantener los iconos dentro del ancho móvil.
