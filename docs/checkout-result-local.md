# Resultado de checkout y recuperación segura

La página web de resultado se rediseña independientemente del email y del seguimiento privado. La animación requiere simultáneamente un estado pagado/en preparación/despachado/entregado y un pago aprobado provenientes del servidor. Una URL, mock=true o paymentStatus no bastan. El número público debe ser numérico y no puede ser el fallback UUID de la vista SQL.

Se mantienen consulta, resumen de productos/importes/entrega, transferencia pendiente, estados rechazado/cancelado/expirado y error con reintento de lectura. Reload sólo lee: no confirma pedidos ni pagos. No se modifica la plantilla de email, worker, scheduler ni la emisión de capacidades.

La navegación reciente guarda únicamente un UUID validado en sessionStorage. No contiene tokens, cookies, datos comerciales ni personales y no otorga autorización. Inicio vuelve a consultar la ruta existente con consulta=carrito; las cookies HttpOnly y la RPC existente siguen comprobando propiedad y sesión. Nunca se confía en un UUID sin credenciales para obtener datos. Ante 401/403/404 se oculta y borra el recordatorio; ante una caída temporal se conserva un enlace genérico sin metadatos del pedido, que sigue requiriendo autorización del servidor al abrirlo.

El acceso se limita a la misma pestaña/contexto y a la vigencia de las cookies originales. No sustituye un enlace portable: logout, otra compra directa, rotación del carrito, cierre de la pestaña o vencimiento pueden terminar el acceso. En otra computadora no se promete recuperación automática; el worker portable sigue desactivado. No se crean estructuras SQL nuevas.

El contador 5→4→3→2→1 sólo se inicia para pago aprobado, con número público, lectura autorizada persistente y almacenamiento de navegación comprobado. No se activa sin almacenamiento ni con prefers-reduced-motion. Volver al inicio navega inmediatamente; Ver mi pedido, Quedarme, pagehide y un cambio de preferencia cancelan el timer. Existe progreso sincronizado y focus accesible.

La página tiene no-referrer y CSP: scripts y conexiones exclusivamente self; sólo estilos de Google Fonts y archivos de fonts.gstatic.com están permitidos para Geist/Inter. No hay scripts de terceros ni credenciales en el resultado. La página privada mantiene su CSP y contrato anteriores.

Tests puros: tests/result-state.test.mjs. Aislamiento del endpoint: suite guest-order-access existente. Chrome desktop/móvil sobre build local: tests/guest-ux-browser.mjs. Para reproducir: construir con Node 22 y STAGING_BACKEND_ORIGIN aprobado; definir MATEBREAK_PLAYWRIGHT_MODULE con el módulo Playwright instalado y MATEBREAK_EVIDENCE_DIR fuera del repositorio; ejecutar node tests/guest-ux-browser.mjs. Las APIs se interceptan, ninguna operación alcanza Cloud; sólo fuentes públicas pueden descargarse. Tailwind externo se sustituye en el ensayo aislado: se verifica el enlace de recuperación de Inicio, no se afirma una nueva auditoría visual completa de la portada.

## Ajustes visuales posteriores
Se reutiliza el isotipo local original y site-brand.css, sin logo alternativo. Tienda se retira exclusivamente de este header. El círculo procesa mientras la lectura real está pendiente; no hay check hasta aprobar pedido y pago. Tras la respuesta se anima círculo/check/título y el evento animationend del título habilita el contador (sin demoras artificiales de red). Cancelar, navegar, cambiar preferencias y recargar conservan sus garantías. Chrome verifica loading/approval/countdown en 1440/360 y captura los estados. Resultado: 219 tests Node y 23 casos browser aprobados antes de comenzar mayorista.

El PNG original tiene transparencia. Dos superposiciones CSS drop-shadow de desplazamiento y desenfoque cero refuerzan el contraste beige sobre el fondo oscuro, sin editar el archivo ni alterar el dibujo o sus proporciones.
