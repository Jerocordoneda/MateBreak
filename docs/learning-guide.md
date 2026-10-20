# Guía para estudiar MateBreak

Recorrido de menor a mayor dificultad. Ejecutá primero `npm ci`, `npm run supabase:start` y `npm run dev` con configuración local. Abrí navegador y DevTools (Network). Nunca uses un proyecto productivo para estos ejercicios. Los diagramas están en [flows.md](flows.md), las decisiones en [architecture.md](architecture.md).

## 1. Cómo arranca

Entrada: `server/index.mjs`. Relacionados: `package.json`, `server/config/environment.mjs`, `server/app.mjs`, `server/jobs/expire-reservations.mjs`. Funciones: `loadConfig`, `createApp`, `startReservationExpiry`. Recorrido: npm inicia Node → lee/valida entorno → compone clientes/proveedores y rutas → escucha el puerto → opcionalmente expira reservas. `loadConfig` no abre sockets al importarse; `index.mjs` es el entrypoint con efectos de arranque esperados. Conceptos: proceso, variables de entorno, ES modules y dependency injection.

## 2. Cómo funciona el frontend

Entrada: `index.html` o un HTML en `src/pages/`. Relacionados: `src/features/catalog/catalog-pages.js`, `src/features/catalog/catalog-ui.js`, `src/css/`, `src/js/header-account.js`. Función: `mountCatalog`. Recorrido: el HTML carga un módulo → busca los elementos `data-catalog` → obtiene productos → crea cards/filtros. Las pantallas de cuenta usan `src/features/account/account.js`; helpers compartidos en `ui.mjs` no inician la página. Los antiguos `src/js/account*.js` son entradas de compatibilidad. Conceptos: DOM, eventos, scripts clásicos frente a módulos, imports estáticos/dinámicos. Ejercicio: seguir una card hasta `/productos/:slug`.

## 3. Conexión al backend

Entrada: `src/services/products.js`. Relacionados: `src/features/account/ui.mjs`, `src/features/checkout/checkout.js`, `server/modules/catalog/routes.mjs`. Funciones: `getProducts`, `api`. Recorrido: `fetch('/api/...')` con cookies del mismo origen → JSON backend → renderización. `getProducts` comparte una petición por página y permite reintentar tras error. Hay helpers HTTP distintos para cuenta/checkout porque sus contratos de body/errores difieren; no se unifican por apariencia. Conceptos: HTTP, async/await, promesas, JSON y códigos de estado. Ejercicio: inspeccionar `/api/productos` en Network.

## 4. Organización de la API

Entrada: `server/app.mjs`. Relacionados: `server/modules/auth/routes.mjs`, `server/modules/cart/routes.mjs`, `server/modules/account/customer-routes.mjs`, `server/checkout/routes.mjs`, `server/payments/routes.mjs`. Funciones: `createApp` y registradores `authRoutes`, `cartRoutes`, `customerRoutes`, `checkoutRoutes`, `paymentRoutes`. Recorrido: seguridad → parser JSON → identidad/carrito → handler → RPC/consulta → JSON; errores llegan al middleware final. El orden de registro de middleware se conserva. Conceptos: Express, middleware, composición, closures, dependencias explícitas. Consultar los métodos/rutas completos en `docs/refactor/after.json`; no confundir una ruta HTTP con una importación.

## 5. PostgreSQL y Supabase

Entrada: el helper `rpc` dentro de `createApp` para comercio y el de `checkoutRoutes` para compra. Relacionados: `supabase/migrations/20260928210316_ars_variant_checkout.sql`, `supabase/migrations/20260929204150_fix_minorista_checkout_lifecycle.sql`, `supabase/platform/`, `scripts/local-test-runtime.mjs`. Funciones SQL: `mb_comercio`, `mb_checkout_minorista`, `mb_checkout_catalogo`. Recorrido: SDK llama RPC con identidad verificada/token hash → PostgreSQL valida y ejecuta transacción → devuelve JSON. Las migraciones posteriores reemplazan funciones anteriores: para entender la versión efectiva, buscar todas sus definiciones en orden cronológico. Conceptos: tablas, claves, funciones SQL, transacciones, roles y RPC. No editar SQL histórico para experimentar; usar una DB local descartable.

## 6. Auth

Entrada: `server/modules/auth/routes.mjs`. Relacionados: `server/integrations/supabase/auth.mjs`, `server/app.mjs`, `server/modules/account/routes.mjs`, `src/features/account/account.js`. Funciones: `authRoutes`, `createAuthFactory`, `accountRole`. Recorrido: formulario → registro/login → Supabase Auth → cookies HttpOnly → `getUser` por request → rol desde membresías DB. Callback intercambia code de confirmación. Nombre de metadata sirve para mostrar, nunca para autorizar. El carrito invitado mantiene una credencial distinta de la sesión Auth. Conceptos: autenticación vs autorización, cookies, JWT, PKCE/callback y datos editables por el usuario.

## 7. Carrito

Entrada: `src/features/cart/commerce.js`. Relacionados: `server/modules/cart/routes.mjs`, `server/app.mjs`, `supabase/migrations/20260928210316_ars_variant_checkout.sql`. Funciones: `cartRoutes`, `hashToken`, RPC `mb_comercio`. Recorrido: producto/variante y cantidad → cookie aleatoria → hash en el servidor → carrito/identidad en SQL → cantidades/precios actuales de vuelta al navegador. Login vincula el carrito; compra directa usa una credencial separada en `checkoutRoutes`. Conceptos: identificadores, hashing, estado persistente y validación del servidor. Ejercicio: intentar enviar un precio arbitrario y comprobar que no se usa.

## 8. Creación del pedido

Entrada: `src/features/checkout/checkout.js`. Relacionados: `server/checkout/routes.mjs`, `server/checkout/policy.mjs`, `server/checkout/mock-store.mjs`. Funciones: `prepareDelivery`, `placeOrder`, `checkoutRoutes`, `validateRecipient`, `calculateTotals`, `createMockCheckoutStore`. Recorrido: contexto → destinatario y entrega → cotización → pago → idempotencia → pedido → resultado. El backend recalcula importes. En mock normal, el store efímero evita tocar reservas/pagos reales; en persistencia local usa el SQL real con proveedor mock. Conceptos: idempotencia, validación y límites de confianza.

## 9. Reserva de stock

Entrada: `supabase/migrations/20260929204150_fix_minorista_checkout_lifecycle.sql`. Relacionados: `supabase/migrations/20260929144308_checkout_minorista_preparacion.sql`, `scripts/test-stock-concurrency.mjs`, `scripts/test-order-lifecycle.mjs`, `server/jobs/expire-reservations.mjs`. Funciones: `mb_checkout_catalogo`, `mb_checkout_minorista`, `mb_expirar_reservas`. Recorrido: resolve variantes y composición → locks/transacción → reservas por SKU físico → pago o cancelación/expiración → transición protegida. El lock de un proceso JS no reemplaza el lock DB cuando hay dos compradores. Conceptos: atomicidad, locks de filas/advisory, deadlocks, race conditions, invariantes y expiración. Leer tests concurrentes antes de intentar modificar esta parte.

## 10. Cotización logística

Entrada: `server/checkout/packaging-service.mjs`. Relacionados: `server/shipping/packaging.mjs`, `server/shipping/carrier-limits.mjs`, `server/shipping/correo-argentino.mjs`, `server/shipping/snapshot.mjs`. Funciones: `packagesFor`, `packagingDecision`, `planPackages`, `quotePackages`, `shippingSnapshot`. Recorrido: categorías servidor → perfiles aprobados exactos de uno/dos bultos → tarifas por bulto → snapshot/fingerprint guardado → pedido. Si falta aprobación física, HTTP 202/manual y descarga de solicitud; no una caja extrapolada. Conceptos: unidades, volumen, peso bruto/volumétrico, adaptadores, snapshot inmutable y fingerprint. Ejercicio: seis sets sin aprobación y con un perfil **sintético de test**, nunca de producción.

## 11. Confirmación de pago e importación

Entrada: `server/payments/routes.mjs`. Relacionados: `server/payments/mercadopago.mjs`, `server/payments/admin-routes.mjs`, `server/shipping/jobs.mjs`, migración lifecycle. Funciones: `paymentRoutes`, `verifyMercadoPagoSignature`, `transferAdminRoutes`, `runShipmentJob`, SQL `mb_confirmar_pago`. Recorrido real diseñado: firma webhook → consultar proveedor autenticado → comprobar referencia/importe/moneda → RPC idempotente → claim logístico por bulto pagado → importar con external ID estable. Retorno del navegador no acredita pago. Rechazo/cancelación libera reservas; pendientes no se confirman. Resultado ambiguo de importación requiere revisión, no reintento ciego. Conceptos: HMAC, autenticidad, idempotencia distribuida, fallos de red y estados. Este flujo solo fue probado local/mock, no con cobros/despachos oficiales.

## 12. Protección y administración

Entrada: `server/security.mjs`. Relacionados: `server/modules/account/routes.mjs`, `server/modules/inventory/routes.mjs`, `server/shipping/admin.mjs`, `server/private-ui/`, `docs/security-architecture.md`. Funciones: `securityMiddleware`, `securityEvent`, `accountRole`, `inventoryRoutes`, `logisticsAdminRoutes`. Recorrido: getUser → rol DB → autorización por operación → consulta/RPC limitada → respuesta allowlist; UI interna tiene CSP/cache restringidos. RLS controla filas, grants acceso a objetos; service key queda solo en backend. Conceptos: CSRF/Origin, XSS/CSP, BOLA/ownership, least privilege y logs sin secretos. Ejercicio: ejecutar `tests/inventory.test.mjs` y `tests/logistics-admin.test.mjs` para ver casos denegados.

## 13. Tests

Entrada: `package.json` y `scripts/test-local.mjs`. Relacionados: `tests/*.test.mjs`, `supabase/tests/`, `tests/concurrency/`, `scripts/test-local-auth.mjs`, `scripts/test-baseline-rehearsal.mjs`, `scripts/audit-architecture.mjs`. Funciones/helpers: `assertLocalTests`, `checkContainer`, `mustSql`, `localStatus`. Recorrido: Node sin proveedores → SQL fixtures rollback → PostgreSQL privado para concurrencia → Auth/RLS/Storage/HTTP local → limpieza/reset/stop. Arquitectura verifica imports, ciclos, scripts originales, rutas y hashes; rehearsal prueba adopción y reconstrucción. Conceptos: unit/integration, doubles inyectados, fixtures, determinismo y pruebas concurrentes reales. Ver `docs/refactor/validation.md` para resultados y comandos.

## 14. Futuro despliegue

Entrada: `docs/hosting.md` y `server/index.mjs`. Relacionados: `scripts/build-frontend.mjs`, `server/config/environment.mjs`, `server/jobs/expire-reservations.mjs`, `server/shipping/jobs.mjs`, `docs/production-release-runbook.md`. Funciones: `loadConfig`, `startReservationExpiry`, `runShipmentJob`; el script de build ejecuta una copia allowlist. Recorrido futuro: CI/tests → staging → entorno/secrets/proxy/cookies → ensayos oficiales → aprobación manual → producción. Node sirve ambos lados inicialmente; Vercel necesita rewrites de API/Auth/pantallas internas. El worker logístico todavía necesita entrypoint operativo y autorización de integración real. Conceptos: liveness/readiness, entornos, filesystem efímero, proxy, workers y release controlado. No activar deploys ni migraciones remotas como ejercicio.
