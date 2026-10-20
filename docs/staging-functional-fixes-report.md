# Correcciones funcionales y UX — candidato local

Fecha: 2026-10-02. Rama: `codex/staging-preparation`. Base: `4dd3c4504d1fb3bfa7680e03e619f4600dc4e757`.

## Resultado y commits

La implementación y validación finalizaron localmente. No hubo compras adicionales, solicitudes de escritura a Staging, cambios en el pedido pagado, stock Cloud, Render, Supabase Cloud o Vercel, ni push, merge o deployments. Desktop/MateBreak permanece fuera de esta implementación.

| Responsabilidad | Commit local | Archivos |
| --- | --- | --- |
| Precios/promociones y progreso de envío | `7a782f8` | `server/checkout/cart-quote.mjs`; `server/modules/cart/routes.mjs`; `src/features/cart/commerce.js`; `src/pages/tienda.html`; `src/css/commerce.css`; `tests/cart-quote.test.mjs`; `tests/checkout.test.mjs`; `scripts/test-cart-pricing-local.mjs`; `tests/concurrency/cart-pricing.sql`; `docs/staging-cart-quotation-contract.md` |
| Simulación y presentación del pedido | `408e613` | `server/checkout/order-simulation.mjs`; `server/checkout/routes.mjs`; `src/features/checkout/checkout.js`; `src/features/checkout/checkout-result.js`; `src/features/checkout/order-presentation.mjs`; `src/features/account/account-orders.js`; `src/pages/checkout.html`; `tests/order-presentation.test.mjs` |
| Replay futuro seguro | `0bd0224` | `.vercelignore`; `tools/staging-idempotency-replay.js`; `tests/idempotency-replay.test.mjs`; `docs/staging-idempotency-procedure.md` |
| Evidencia reproducible de validación | Commit de este informe | `tests/staging-ux-preview.mjs`; este informe |

## Diff revisado

### Carrito

La incoherencia procedía de mostrar el precio/subtotal base de la selección y calcular en el navegador el progreso de envío a partir de ese total, mientras checkout cotiza mediante SQL y considera promociones. El carrito ahora recibe una cotización aditiva calculada con `mb_cotizar_catalogo`, muestra original, promoción y mercadería efectiva, y usa el mismo `shippingProgress` del servidor que checkout. Ya no contiene la regla comercial del umbral de envío gratis.

Se conservan los campos legacy y se descartan precios/descuentos/stock falsificados en PUT. Fallos o diferencias en la cotización dejan la selección guardada y bloquean checkout. El resumen identifica que el envío y el total definitivo todavía requieren cotización. Se corrigió un pequeño desbordamiento móvil del importe al validar a 360 px.

No se cambian promociones, SQL ni precios: la cotización base usa Mercado Pago y no aplica transferencia. La política existente de transferencia y combos permanece sin reinterpretación; los tests comprueban sus resultados actuales. Los precios originales y la cotización se leen sucesivamente, por lo que no constituyen una instantánea atómica. La operación final sigue recomputando precios y stock del lado servidor.

### Checkout, resultado y Mi Cuenta

El contexto ahora distingue mock persistente de volátil. La UI explica que una prueba persistente guarda el pedido y reserva inventario de prueba, sin cobros ni despachos reales. Se retiró también el texto incorrecto del HTML oculto inicial.

Un pedido persistente se identifica por el marcador existente del pago: método Mercado Pago y referencia exacta `TEST-LOCAL-UUID-del-pedido`. No se infiere simulación del método solo ni del modo actual del proveedor. El endpoint de lectura conserva autenticación/filtro por propietario y agrega la procedencia; el frontend acepta el marcador persistido para compatibilidad con respuestas anteriores. Resultado y Mis pedidos muestran explícitamente la simulación.

La entrega lee el destinatario anidado o el formato legacy, usando texto de nombre/dirección/localidad y evitando `[object Object]`. Se omiten teléfonos, email e instrucciones privadas del resumen de pedidos. Se mantienen navegación, detalles accesibles y diseño existente.

### Idempotencia futura

Se preparó un snippet manual, excluido del despliegue. Captura el request ORIGINAL de una nueva compra autorizada y mantiene body/opciones en una clausura del mismo navegador. Detiene la navegación de la UI después de la primera respuesta, exige auditoría previa y admite una sola repetición literal con la misma clave y sesión. Nunca exporta cookies/tokens/contraseñas ni reconstruye la compra anterior. Consume el intento incluso ante fallo y no tiene retries. El procedimiento completo está en `docs/staging-idempotency-procedure.md`.

La prueba del mecanismo realizada aquí fue en memoria y loopback; no demuestra todavía la idempotencia del backend publicado. Su comprobación externa queda pendiente de una autorización separada.

## Validaciones finales

Runtime: Node **22.23.3**, invocado explícitamente con npm CLI. No se utilizó Node 24 para la validación final.

| Validación | Resultado |
| --- | --- |
| `npm ci` | PASS, 120 paquetes; audit: 0 vulnerabilidades |
| `npm test` | **187/187 PASS**, sin fallos ni skips |
| `npm run build`, origen Render Staging | PASS; guarda estricta aprobada |
| Test SQL local de precios/lifecycle | PASS; funciones reales del repositorio, contenedor propio y base vacía; BEGIN/ROLLBACK y verificación posterior de base vacía |
| 1 / 2 / 8 / 10 unidades | 10.000 / 16.000 / 64.000 / 80.000; envío gratis sólo desde 80.000 |
| Cantidad 1→2→1 | PASS HTTP persistido en adaptador aislado y navegación/reload en navegador local |
| Elegibles/no elegibles, combo legacy/variante, transferencia vigente | PASS SQL y Node; sin cambio de política |
| Cambio de precio antes de confirmar | PASS SQL; se recomputa, no acepta importe del cliente |
| Stock desaparece antes de confirmar | PASS SQL; rechazo sin pedido ni pago residual |
| Auth, propietario y proveedores mock | Suite existente PASS; test adicional de lectura: 200 propietario, 401 sin sesión, 404 no encontrado; sin uso de proveedores reales |
| Replay local | PASS Node y navegador: dos requests, un registro en memoria, misma sesión y body literal; segunda repetición bloqueada |
| Diff | `git diff --check` y revisiones de cada commit PASS |

El SQL de pruebas crea fixtures y un pedido aprobado exclusivamente en la base desechable LOCAL dentro de la transacción revertida. No modifica migraciones ni ejecuta SQL remoto. La vista de navegador local no tiene cliente Supabase ni proxies hacia Cloud; el único POST de pedido que admite es el fixture fijo de `/audit/replay`, guardado en memoria con cookie sintética.

## Navegador

Se verificó el frontend compilado en un navegador real con endpoints locales sintéticos. Desktop 1440 px y móvil 360 px, navegación inicial sin datos de una sesión Cloud:

- Carrito: originales/promoción/subtotal correctos; 1→2→1; ocho unidades con ARS 16.000 restantes para envío gratis; diez unidades con envío gratis.
- Checkout: importe de mercadería y mensaje correcto de reserva persistente; total pendiente de cotizar envío. No se confirmó ninguna compra ordinaria.
- Resultado: pago simulado y reserva persistente explícitos; enlace a Mis pedidos conservado.
- Mi Cuenta: pedido mock y pedido legacy diferenciados; destinatarios renderizados sin objeto ni contacto innecesario.
- Resumen móvil final: `scrollWidth === clientWidth` (345 px de contenido en viewport 360 px, descontada scrollbar), sin desbordamiento horizontal.
- Console: sin errores/warnings en las vistas verificadas. Los endpoints usados durante esta validación pertenecen a loopback, no a proveedores externos.

Capturas y logs de prueba completos permanecen fuera del repositorio en la carpeta local de visualizaciones, subcarpeta `functional-fixes`: `cart-desktop.jpg`, `cart-mobile-summary.jpg`, `checkout-mobile.jpg`, `result-mobile.jpg`, `orders-desktop.jpg`, `orders-mobile.jpg`, `replay-local.jpg`. La captura anterior `cart-mobile.jpg` corresponde al hallazgo previo al ajuste y no representa el resultado final.

La navegación/login/logout reales en Staging no se repitieron en esta iteración. Las regresiones de Auth, stock, pago y logística se validaron con la suite Node existente y SQL local; no se afirma una nueva prueba E2E Cloud.

## Artefacto y aislamiento

`dist` contiene **137 archivos**: exactamente `index.html` y los archivos de `src/`, con hashes idénticos a las fuentes. El archivo adicional frente a la publicación anterior es el helper público `order-presentation.mjs`. No contiene backend, SQL, tests, tools, docs, logs, `.env`, `.vercel` ni evidencias. La revisión de archivos de texto tampoco encontró claves privadas PEM, claves Supabase secret ni JWT con formato de credencial. Manifiesto SHA-256 completo almacenado localmente fuera del repositorio; SHA-256 del manifiesto: `217a6b8bea7faa957557f31f0d318264db63e3d5c65ce53b71cc2de1bf7e5d3d`.

`vercel.json` y `scripts/staging-config.mjs` no tienen cambios. Se conservan `isDeepStrictEqual`, las reglas explícitas de raíz, noindex/no-store, Git deploymentEnabled=false y rewrites `/api`, `/auth`, `/interno`, `/healthz` exclusivamente a `https://matebreak-api-staging.onrender.com`. El enlace local conserva `matebreak-staging`, Project ID `prj_CrDsy4AToxUT27bCsEbuaDmAceJh` y el orgId ya aprobado del equipo copplex1. No se consultaron ni modificaron settings remotos en esta iteración.

No se construyó un nuevo artefacto Vercel prebuilt ni se ejecutó deploy: `dist` es la validación del frontend. El prebuilt anterior no es candidato para estas correcciones.

## Estado pendiente y próxima aprobación

Los cambios de esta iteración están en commits locales separados. Permanecen sin incorporar los cambios previos de `deploy/staging/fixtures.sql`, los tres SQL de mapping/coherencia y los informes previos de E2E, mapping y publicación visual. Se conservaron intactos y no están en estos commits; por tanto el worktree global no se declara limpio. No se publican respaldos ni logs crudos.

La publicación necesita coordinar backend y frontend: aprobar primero el código/los commits; autorizar por separado la publicación de la rama si Render requiere el código en GitHub, y un deploy manual exclusivamente de Render Staging; verificar la cotización/contexto con lecturas; luego construir/auditar un prebuilt nuevo y solicitar/publicar un único deployment manual de Vercel Staging. Git automático debe permanecer desconectado.

La compra anterior y su stock no se limpiaron ni repusieron. Las pruebas rejected/pending, el replay externo real y el Health Check Path pendiente siguen fuera del alcance.
