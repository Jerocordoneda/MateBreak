# Podcast — sección editorial, 5 octubre 2026

Base obligatoria: `bbac0c5f7f7701f7ce84819428ac9c5822d0e3f0`, rama `codex/manual-review-fixes`, CI previa 37298752497 SUCCESS. Antes de editar se verificaron HEAD local/remoto, worktree limpio y PR #4 OPEN/DRAFT. Se leyeron los cierres responsive y proveedores. El pedido actualizado reemplazó expresamente la propuesta anterior de asistente de voz; no se implementó ninguna infraestructura de voz.

## Implementación

`/podcast` sirve `src/pages/podcast.html` mediante una ruta estática Express y un rewrite estático Vercel. El generador/validador estricto de hosting incluye esa misma ruta; el proxy API, los headers de seguridad y el bloqueo de auto-deploy no cambian.

El acceso es un enlace HTML normal con SVG decorativo, nombre accesible **Podcast de MateBreak**, área mínima 44×44 y foco visible. Se incorpora en los headers existentes del Home, páginas de colecciones/FAQ/Nosotros/mayorista y las barras comerciales que ya contienen `mb-header-actions`. No se añadió un header nuevo a las páginas que no lo tenían. El enlace funciona también sin JavaScript. Podcast identifica el enlace actual mediante `aria-current="page"`.

La página reutiliza el header global, navegación responsive, cuenta y carrito, el tema de Home/FAQ (`5f00f0fce391`), colores de superficie/primary/secondary, Geist/Inter, botones `rounded-xl`, tarjetas `rounded-2xl`, gutters y escalas existentes. `podcast.css` contiene únicamente el layout editorial específico, ilustración SVG decorativa y límites responsive; no define una paleta ni un sistema tipográfico nuevo. El footer conserva la superficie, marca y tipografía existentes y ofrece enlaces reales de navegación.

Estado inicial: **Próximamente**, sin episodios publicados en esta sección. No se inventan nombres, invitados, fechas, reproducciones o estadísticas. `#episodios` contiene el estado vacío, listo para sustituirse por artículos de episodios y enlaces verificados cuando el titular aporte material real. No existe feed duplicado, backend de episodios, player, embed ni dependencias nuevas.

## Seguridad y accesibilidad

No hay captura, grabación, permisos, reconocimiento, transcripción, IA ni APIs de voz. Se conserva `Permissions-Policy: microphone=()` y la CSP existente. No hay variables nuevas, API keys, audio/video/iframe, trackers o proveedores de Podcast. Las únicas solicitudes son los recursos del storefront y sus APIs existentes de lectura para cuenta/carrito.

Página española, título/descripción, estructura h1/h2/h3, regiones con títulos, skip link, texto completo, foco visible y navegación por enlaces ordinarios. El micrófono y su ilustración se excluyen del árbol accesible; el enlace tiene nombre propio. No hay autoplay, modales ni formularios, y no se introduce una interacción con teclado virtual. Los estilos reducidos de movimiento del cierre responsive se conservan.

## Pruebas y hallazgos

- **REAL LOCAL:** `tests/podcast-browser.mjs` sobre Chrome + Express reales, sin interceptaciones: 320×720, 360×800, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1440×900 y 844×390. Enlace por teclado, 44 px, cero overflow/superposición, menú y Escape, ruta directa y HTML, estado vacío, salto a episodios debajo del header, salida al catálogo real y navegación sin JS. Cero excepciones de página, API 500 o peticiones a plataformas de medios/proveedores.
- **REAL LOCAL:** suite responsive aprobada, sin modificar sus assertions: **263 layouts / 48 escenarios PASS**. Incluye cuenta/login/logout/perfil, carrito/catalogo106/producto, checkout y validaciones, transferencia pendiente24h, 11 ofertas mayoristas/autocompletado, admin/transferencias/pedidos, inventario/modales/logística y colecciones. Usa cuentas y pedidos descartables locales; pago/envío son mocks locales, no proveedores reales.
- **Unitarias:** **298 PASS**, sin tocar assertions comerciales, de Auth, SQL o hosting. Build Staging y auditor público PASS: **180 archivos estáticos**. `npm audit`: cero vulnerabilidades. CI del SHA final se registra en los documentos externos de cierre para evitar una referencia circular dentro del propio commit.
- **MOCK:** suites frontend existentes guest/enterprise PASS con respuestas interceptadas; no se presentan como prueba de APIs Cloud.
- **CLOUD:** no deploy, consulta de baseline ni escritura Cloud. No se aplicaron migraciones ni se activó proveedor alguno.

La primera inspección visual encontró choque entre marca y ayuda a 768 px tras agregar el enlace. Se compactó sólo la ayuda a 14 px/gap16 en tablet (761–1023) y se agregó una comprobación de colisión entre las tres partes del header. El test inicial detectaba choques únicamente entre acciones; su cobertura se amplió sin relajar assertions comerciales. El salto a episodios ocultaba inicialmente el h2 detrás del header fijo: `scroll-margin-top` lo corrige y se verifica mediante bounding boxes. Ambos hallazgos quedaron resueltos en las capturas finales.

## Integridad y reproducción

`src/css/responsive.css`, sus módulos JS y suites previas permanecen intactos. Backend comercial, Auth/RLS/SQL, reservas, precios, descuentos, pedidos, stock, outbox, proveedores y dependencias no cambian. La única modificación de `server/app.mjs` es la ruta estática GET `/podcast`.

Se mantiene desde dos mates físicos el 20% sobre productos y 10% adicional secuencial por transferencia (28% efectivo); envío excluido, pendiente24h, confirmación manual auditada y liberación idempotente. Catálogo106/217/929, 610 originales y delta1358 intactos. Migraciones38/39 siguen pendientes de autorización Cloud según el traspaso anterior. Main y PR #2 no se modifican; PR #4 sigue OPEN/DRAFT y contiene PR #2 por ancestralidad.

Reproducir con Node22, Docker local owned y sin credenciales Cloud: iniciar/resetear mediante `scripts/local-supabase.mjs`, ejecutar `scripts/seed-responsive-local.mjs`, iniciar `scripts/preview-manual-review-local.mjs`; usar `MATEBREAK_PLAYWRIGHT_MODULE` instalado y `MATEBREAK_EVIDENCE_DIR` externo para `tests/podcast-browser.mjs` y `tests/responsive-local-browser.mjs`. Detener preview, resetear exclusivamente fixtures locales y detener Supabase conservando backups. Las suites guest/enterprise usan el build `dist` y las mismas variables de evidencia/módulo. `npm test`; `npm run build:staging` y auditor con `STAGING_BACKEND_ORIGIN=https://matebreak-api-staging.onrender.com`; `npm audit`.

## Traspaso y límites

El SHA final, CI exacta, archivos/diff, integridad y capturas desktop/mobile se adjuntan en A — Informe Podcast y B — Traspaso externos. No se reclama validación en Safari/iPhone/Android físicos o lectores de pantalla humanos; quedan pendientes del cierre preproducción.

Para publicar contenido se necesitan episodios/enlaces/portadas/datos reales aprobados. Preferir enlaces ordinarios; un futuro embed requiere revisar privacidad, accesibilidad, cookies y CSP por separado, sin abrir permisos de micrófono. No hace falta contratar ni configurar un proveedor de voz.

Siguiente fase: cierre preproducción MateBreak V1, comenzando desde el SHA final Podcast. Leer este documento, `responsive-mobile.md` y `provider-readiness.md`. Publicación, migraciones38/39, Storage/fotografías, DNS/SMTP/Resend, Mercado Pago, MiCorreo, workers/scheduler, merges y producción continúan fuera de esta autorización. Custodia DB37/DPAPI y temporales protegidos conservan los pendientes anteriores. Detenerse al terminar Podcast.
