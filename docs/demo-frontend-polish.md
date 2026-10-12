# MateBreak — candidato local para demo (12 de octubre de 2026)

Rama: `warp/visual-fixes`. Sin push, merge ni despliegue.

## Cambios

- Tarjeta compartida más compacta: fotografía completa con `object-fit: contain`, títulos y descripción limitados a dos líneas, alturas alineadas, precio real en cobre y botón de 44 px en la misma fila. El contador visual queda oculto conservando filtros, conteo y anuncio accesible.
- El `+` usa el mismo servicio que el detalle: GET del carrito, PUT de cantidad acumulada y evento `mb:cart` para actualizar el header. Las operaciones se serializan para evitar pérdida de incrementos entre tarjetas, y cada botón bloquea clics durante su solicitud. Confirmación y errores se anuncian discretamente. El servidor mantiene la autoridad sobre stock.
- Productos con opciones, varias variantes o personalización entran al detalle existente. Se reconocen también nombres explícitamente personalizados del catálogo histórico, que no siempre trae el indicador estructurado. No se elige una variante arbitraria.
- Un único CTA «Personalizá el tuyo», con ruta original `/productos/imperial-de-algarrobo`, mayor tamaño y centrado. Badge de colección decorativo sin enlace, flecha ni rol de botón.
- Submenús existentes desplazados 14 px hacia la derecha en desktop; sin animación que altere el anclaje. En móvil se elimina el desplazamiento individual `translate` heredado de Tailwind y se limita el panel al viewport. Se conserva teclado, escape y menú táctil.
- Fondo claro continuo en móvil, sin los márgenes oscuros heredados del padding global de `main`.
- Navegación de tablet en una sola línea y mate de desktop/tablet dimensionado por altura del viewport para mostrarlo completo y evitar ampliar innecesariamente los originales.

## Mate interactivo

Se preservan los 60 WebP originales y sus nombres. Pointer Events con captura de puntero recorren la secuencia horizontalmente; `touch-action: pan-y` permite el scroll vertical del navegador. Flechas, Inicio y Fin ofrecen acceso por teclado. El índice queda limitado al rango disponible.

Se mantienen la reproducción por scroll en desktop y la exploración manual en todos los tamaños. Tras el primer arrastre o acción de teclado, el scroll deja de reemplazar la posición elegida. Se cargan el frame solicitado y hasta dos vecinos por lado, sin analizar ni descargar toda la secuencia al iniciar. Las imágenes se reemplazan cuando están cargadas. IntersectionObserver detiene el trabajo fuera de la zona visible; requestAnimationFrame se usa sólo cuando hay una actualización pendiente.

`prefers-reduced-motion` desactiva movimiento automático y pulso, conservando la interacción solicitada por el visitante. Los recursos muestran inclinación y cambio de encuadre, **no una rotación completa de 360°**; no se generan vistas adicionales. La nitidez máxima depende de esos originales.

## Transición y header

La curva blanca existente se convierte en una capa continua que asciende con el scroll y se superpone 40 px al espacio inferior de la sección oscura; el desplazamiento se calcula sobre el rectángulo local de la transición, sin librerías nuevas ni bucles permanentes. En movimiento reducido la capa permanece estable y el desplazamiento normal de la página produce el cruce.

El header compara el borde superior central real de la curva transformada con el centro de su propio rectángulo (`getBoundingClientRect`). Se limita el borde a su contenedor de clipping para que una parte invisible no dispare el tema. El evento `mb:transition` sincroniza ambos en el mismo pintado. Scroll, resize, pageshow y ResizeObserver cubren vuelta hacia arriba, restauración y cambios de altura. La clase compartida recolorea marca, navegación, acciones, menú móvil, submenús, bordes y foco. El fondo casi opaco mantiene contraste durante el cambio. El logo existente se adapta mediante filtro; no se inventa una marca.

## Archivos

- `index.html`
- `src/css/responsive.css`
- `src/features/catalog/catalog-ui.js`
- `src/features/catalog/product-detail.js` (únicamente reutilización del servicio de agregar)
- `src/features/cart/add-item.js` (servicio extraído del comportamiento previo)
- `src/js/scroll-sequence.js`, `src/js/script.js`, `src/js/header-fade.js`
- `tests/demo-polish.test.mjs`
- `scripts/test-demo-browser.mjs`, `scripts/demo-screenshots.mjs`
- Este informe.

Sin nuevas dependencias ni modificaciones a package.json/lockfile. El build regenera los CSS de utilidades sin diferencias de contenido.

## Verificación

- Build completo: **PASS**, `npm run build`, con `STAGING_BACKEND_ORIGIN=https://matebreak-api-staging.onrender.com`, tomado del proxy ya revisado en `vercel.json`. No se cambia la configuración ni se publica. Fue necesario restaurar dependencias existentes con `npm ci --include=dev`.
- Regresión nueva: **2/2 PASS**. Selección obligatoria, personalización histórica, incrementos serializados, credenciales same-origin, contador y recuperación tras error.
- Suite existente más regresiones: **320/324 PASS**. Cuatro fallos en `baseline-guards.test.mjs` y `local-test-guards.test.mjs`: la guarda detecta primero la URL remota presente en `.env`, por lo que no llega a los mensajes que esperan esas pruebas. No se modifican esas guardas ni `.env`.
- `npm run test:full`: **BLOQUEADO** por esa misma protección frente a Supabase remoto. No se ejecuta ninguna prueba destructiva sobre el backend conectado.
- Las cinco pruebas de esos dos archivos se ejecutan además en una copia mínima aislada sin `.env`: **5/5 PASS**, comprobando que los fallos son de configuración; log en `outputs/demo-isolated-guards.log`.
- `npm run test:architecture`: **FALLO** en el hash histórico de `20260907203438_commerce.sql`. No hay diferencias Git en `server/` ni `supabase/`; no se reescribe la migración ni la referencia histórica para hacer pasar la auditoría.
- Navegador Chrome real con Playwright: **66 vistas PASS**, inicio, catálogo, detalle simple, detalle con opciones/personalizado, carrito y entrada a checkout, en **320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440 y 1920 px**. Sin desbordamiento horizontal ni errores JavaScript en esa matriz.
- **15 grupos de interacción PASS**: mouse a 1440, touch real mediante CDP a 390, teclado y extremos de secuencia, tema del header en ambos sentidos, paneles dentro del viewport, submenú táctil y navegación por flecha/escape en desktop. Movimiento reducido y badge sin enlace verificados.
- `+`: contrato del frontend validado para estados invitado y autenticado, con carrito interceptado **sólo en las pruebas**; doble clic produce un único PUT, incremento conserva cantidades, badge refleja la respuesta, rechazo de stock permite reintento y conserva contador, clic de tarjeta navega, opciones no generan PUT. El catálogo usado es una lectura real guardada localmente, sin alterar precios ni introducir productos ficticios en la aplicación.

## Límites de aceptación

No se declara verificada una compra autenticada real, una reserva, el pago ni checkout con carrito completo: la integración destructiva no puede correr con la configuración remota. Las vistas de carrito/checkout incluyen el estado de entrada sin finalizar compra. Las sesiones de la prueba de contrato se controlan en el navegador; no representan un login real. Se observaron límites de frecuencia al repetir lecturas del catálogo, por lo que la matriz reutiliza su respuesta real en lugar de consultar el backend decenas de veces.

Las dos capturas mencionadas en el pedido no llegaron adjuntas. La rama local no incluye un buscador global en el header ni un disparador llamado «Catálogo» en su segunda fila; se conserva su navegación de categorías actual y su búsqueda en catálogo. No se introduce un menú paralelo ni un buscador nuevo. Los productos personalizados históricos sin indicador conservan su flujo existente: según las FAQ, los detalles del diseño se comunican después de comprar. No se modifica ese proceso.

Backend, APIs, esquema, migraciones, RLS, autenticación, pagos, envíos, stock, reservas, mayorista, seguridad e integraciones quedan sin cambios. La única extracción funcional es la acción de agregar al carrito ya existente. `.env.example` y `outputs/` eran cambios previos; `.env.example` se excluye del commit y se preserva.

## Evidencias locales

- `outputs/demo-polish/before/`: hero, tarjetas y transición a 390 y 1440.
- `outputs/demo-polish/after/`: mismas vistas posteriores.
- `outputs/demo-polish/mate-drag-390.png`, `mate-drag-1440.png`
- `outputs/demo-polish/header-light-390.png`, `header-light-1440.png`
- `outputs/demo-polish/menu-390.png`, `menu-1440.png`
- `outputs/demo-polish/browser-report.json`
- `outputs/demo-build.log`, `demo-unit-tests.log`, `demo-full-tests.log`, `demo-regression-tests.log`, `demo-architecture.log`, `demo-isolated-guards.log`

Estas evidencias y la respuesta local del catálogo quedan en outputs, fuera del commit de código.
