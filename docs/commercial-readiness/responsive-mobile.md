# Responsive/mobile — cierre local 2026-10-05

Base: `40c87511a0f75dea41863847a73bc4ae57ef1ce6`, rama `codex/manual-review-fixes`, PR #4 borrador. Este trabajo adapta presentación y navegación; no publica Staging. El SHA final y la CI exacta se registran en el informe externo de cierre para evitar una referencia circular dentro del propio commit.

## Resultado y alcance

Chrome real contra Express y Supabase Auth/PostgREST locales: **263 layouts y 48 escenarios PASS**, sin interceptar APIs, sin solicitudes a proveedores reales, sin excepciones JavaScript ni respuestas `/api/` HTTP 500. Matriz: 320×720, 360×800, 375×812, 390×844, 430×932, 768×1024, 1024×768 y 1440×900; landscape 844×390 en medios, carrito, checkout, admin y modales. Las dimensiones exactas también constan en el JSON de resultados.

Se verificaron home, catálogo de 106 productos, búsqueda vacía, producto, carrito, checkout/error de destinatario, pendiente de transferencia/datos bancarios, login, registro general y contextual, recuperación, confirmación, perfil, presentación mayorista, 11 ofertas privadas, solicitud/autocompletado, admin/pedidos/transferencias, inventario y tres modales, logística y las 15 páginas de colecciones/FAQ/Nosotros.

Las capturas principales son PNG de `real-browser`, tomadas desde el navegador real local. Las capturas de confirmación y cambio de contraseña de `auth-real` pertenecen a la prueba real de Mailpit. Las suites frontend existentes con APIs interceptadas se registran por separado y no se consideran evidencia de validación Cloud.

## Hallazgos corregidos

- Home 320: título y hero demasiado grandes, imagen superpuesta, espacio de secuencia excesivo y CTA incómodo. Ahora el hero tiene flujo vertical propio, texto fluido e imagen contenida; desktop conserva la secuencia.
- Header: categorías dependientes de hover y fila demasiado ancha. Menú móvil acotado al viewport, subcategorías con botón propio, teclado/ArrowDown/Escape, foco visible y enlaces ordinarios. Tablet reduce los espacios para evitar el desborde observado a 844 px. Los botones conservan 44 px.
- Catálogo pequeño: dos tarjetas estrechas impedían leer precios y acciones. Hasta 540 px se presenta una tarjeta horizontal por fila; desde 541 px conserva la grilla. No cambia el conjunto de productos ni su orden de negocio.
- Formularios y checkout: gutters, encabezados, resumen y controles excesivos. Layout apilado, campos de 16 px en mobile, controles táctiles, errores vinculados y foco en el primer campo inválido.
- Transferencia: CBU/alias y detalles largos se envuelven; copiar conserva el valor original. La referencia bancaria administrativa tiene etiqueta visible y placeholder corto; el toast móvil ocupa flujo normal.
- Mayorista: tarjetas, escalas y cantidades estrechas. Tarjetas individuales en pantallas pequeñas y escalas como pares etiqueta/valor. Se conservan precios, cantidades y autocompletado.
- Administración: filtros y acciones se apilan, historiales se envuelven y los modales permiten scroll propio, cierre visible y límites `dvh`.
- Rendimiento: mobile/reduced-motion utiliza el primer frame, sin precargar la secuencia completa; se suspenden bucles decorativos al entrar en mobile o esconder la pestaña. Las animaciones desktop permanecen.

El header admite el espacio de una acción futura adicional; no se implementó Podcast, micrófono ni permisos nuevos.

## Clasificación de tablas y datos

| Vista | Tratamiento | Resultado |
|---|---|---|
| Inventario | B — tarjetas mobile con etiquetas; tabla desktop existente | Campos y acciones accesibles, sin modificar cantidades |
| Escalas mayoristas | B — pares etiqueta/valor en mobile | Tres escalas preservadas |
| Pedidos y transferencias | B + D — tarjetas y detalles expandibles | Referencia, confirmación, estado y auditoría conservados |
| Historiales/movimientos | D — detalle y texto envuelto | Identificadores y fechas conservados |
| Logística | B/D según estructura existente | Filtros y detalle conservados; estado vacío local verificado |
| Contenedores tabulares existentes | A — scroll local cuando corresponde | No se utiliza overflow oculto global para maquillar fallos |

No se ocultaron columnas esenciales mediante C. La cobertura de logística con despachos reales y auditorías históricas pobladas sigue pendiente; no se simularon acciones comerciales sólo para rellenar pantallas.

## Lógica y datos preservados

La política aprobada permanece: desde **dos mates físicos**, 20% sobre productos, luego 10% por transferencia: 28% efectivo; envío excluido. Pendiente de transferencia de 24 h, revisión manual/auditada y liberación idempotente de reserva sin cambios.

La prueba real local produjo un único pedido sintético en la ejecución final: productos 58.600 → 46.880 → 42.192 con retiro simulado. Una comprobación manual local previa con sucursal simulada mantuvo envío 8.500 y total 50.692. No hubo compra ni datos sintéticos Cloud.

227 archivos protegidos coinciden con sus objetos Git de la base: backend funcional, SQL/migraciones, configuración de despliegue, activos y dependencias. Sólo las dos páginas HTML privadas reciben la hoja responsive. `account-admin.js` modifica únicamente etiqueta/placeholder de presentación.

- Migración 38 SHA-256: `78e9a04b0d2ce51f54419c85119612a88078276c9d349544ddcb64d4160a3418`.
- Migración 39 SHA-256: `a90780533f9e66eb957af55735e1570f448a8413089fd91ece82a616da11a3e9`.
- 106 productos, 217 variantes, 929 referencias y recuperación de 610 originales/delta de 1.358 actualizaciones permanecen íntegros. No se subieron fotografías ni se cambió Storage.
- No se modificaron RLS/Auth backend, estados, reservas, stock Cloud, outbox, proveedores, workers, scheduler, main, PR #2, Tiendanube, DNS ni credenciales.

## Pruebas

| Control | Resultado | Naturaleza |
|---|---|---|
| `npm test` | 298 PASS | Unitarias existentes; assertions comerciales intactas |
| `tests/responsive-local-browser.mjs` | 263 layouts / 48 escenarios PASS | APIs locales reales, fixtures descartables |
| `scripts/test-preproduction-auth-browser.mjs` | PASS 1440/360 | Auth + Mailpit PKCE reales locales, perfil, logout, recuperación, contraseña anterior denegada y JWT revocado sin filas RLS |
| `tests/guest-ux-browser.mjs` | PASS | Frontend compilado con APIs interceptadas |
| `tests/enterprise-entry-browser.mjs` | PASS 1440/360 | Navegación teclado con APIs interceptadas |
| Build Staging / auditor público | PASS; 178 archivos estáticos | Proxy revisado; sin backend/SQL/secretos en artefacto |
| `npm audit` | 0 vulnerabilidades | Dependencias sin cambios |
| Integridad protegida | 227/227 | Comparación de objetos Git normalizados |

La suite Auth antigua esperaba un retorno sin `auth=confirmed` y redirección automática mayorista. El código aprobado ya preservaba el marcador y ofrecía un enlace explícito de continuación. Se actualizó la prueba a ese comportamiento y al menú mobile; no se modificó Auth ni se relajaron permisos, recuperación o assertions de lógica comercial. Los fallos diagnósticos previos se conservan en evidencia externa.

## Reproducción

Node 22, Docker local perteneciente a este worktree. No heredar credenciales Cloud/proveedores. `scripts/local-supabase.mjs` rechaza destinos remotos y contenedores ajenos. Los resets siguientes son únicamente de fixtures descartables locales; nunca un reset Git ni Cloud.

1. `node scripts/local-supabase.mjs start` y `node scripts/local-supabase.mjs reset`.
2. `node scripts/seed-responsive-local.mjs` sobre Auth vacío y cero pedidos.
3. `node scripts/preview-manual-review-local.mjs` en terminal separada.
4. Definir `MATEBREAK_PLAYWRIGHT_MODULE` con el módulo Playwright instalado y `MATEBREAK_EVIDENCE_DIR` fuera del repositorio; ejecutar `node tests/responsive-local-browser.mjs`.
5. Detener preview. Para la suite Auth aislada, reset local y `node scripts/test-preproduction-auth-browser.mjs`, con `MB_PLAYWRIGHT_MODULE` y `MB_EVIDENCE_DIR` externos. La suite inyecta fixtures propios; no mezclar esa DB con la medición del catálogo de 106 productos.
6. `npm test`; `STAGING_BACKEND_ORIGIN=https://matebreak-api-staging.onrender.com npm run build:staging` (asignar variable según shell); `node scripts/audit-guest-artifact.mjs`; suites guest/enterprise con sus variables de módulo/evidencia; `npm audit`.
7. Detener servidores, reset de fixtures únicamente en la instancia owned y `node scripts/local-supabase.mjs stop`. Conservar backups y temporales protegidos.

## PENDING y traspaso

Validación en iPhone/Safari y Android físicos, teclado virtual, zoom del sistema/lector de pantalla y rendimiento con red lenta no se certifican mediante viewports Chrome. No se confunde el mock local de pago/envío con proveedores reales. Fotografía real completa continúa pendiente de capacidad y recuperación autorizadas; los placeholders actuales no fueron sustituidos.

No se comprobó un baseline Cloud nuevo en esta fase. El estado Cloud histórico de 37 migraciones y las migraciones 38/39 pendientes procede del traspaso anterior, no de consultas actuales. Publicación/correos/proveedores/producción siguen requiriendo la fase y autorización correspondiente.

PR #4 debe permanecer DRAFT y contener íntegramente PR #2; la prueba final de ancestralidad se adjunta al cierre. Continuar desde el SHA final responsive, leyendo este documento y `provider-readiness.md`. El prebuilt anterior queda obsoleto: construir y auditar de nuevo desde el SHA final cuando exista autorización de publicación. No encadenar Podcast ni una publicación.

El backup portable DB37 ya restaurado sigue bajo la custodia pendiente descrita en `provider-readiness.md`; su clave no fue leída ni revelada. El backup legado DB32 depende del perfil Windows/DPAPI. No se eliminaron temporales descifrados ni se eludieron bloqueos de limpieza.
