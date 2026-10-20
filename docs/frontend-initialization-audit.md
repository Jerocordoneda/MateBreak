# Auditoría de inicialización del frontend — 2026-10-01

Registro histórico del diagnóstico previo. La corrección local posterior y sus
pruebas constan en [header-initialization-fix.md](header-initialization-fix.md).

## Causa reproducida

El responsable aclaró que la URL con la interfaz inicialmente incompleta era
https://matebreak-api-staging.onrender.com/, no la URL de Vercel.
Se reprodujo en navegador: el primer estado de Render contiene shopping_cart
con href="#" y no tiene Mi cuenta. El estado posterior contiene /carrito y
/mi-cuenta. No se mostró un deployment viejo: el mismo HTML fue transformado por JS.

index.html no contiene el acceso Mi cuenta y conserva el carrito con href="#".
src/js/header-fade.js espera DOMContentLoaded y después hace import dinámico de
/src/js/header-account.js. Ese módulo importa site-brand.js, crea los enlaces,
reemplaza iconos, añade clases del layout e inserta un link de stylesheet a
/src/css/header-account.css. El navegador puede pintar el HTML inicial antes de
terminar esas descargas y la transformación. La CSS del header llega todavía más tarde.

Por eso una ejecución con recursos en caché parece inmediata y una carga nueva
o más lenta revela la estructura inicial incompleta. No se midió cuánto aportó
cada descarga en la sesión del responsable; sí se confirmó la secuencia causal.
La falta temporal del enlace no depende del resultado Auth ni del catálogo:
header-account monta la estructura antes de su primer fetch del resumen de carrito.

## Qué sirve cada entorno

| Entorno | Archivos/rutas comprobados |
| --- | --- |
| localhost:3000 observado | Node server/index.mjs; index.html del checkout main 15c9d64; catálogo /src/js/catalog-pages.js |
| Render raíz | Express publica index.html y /src; catálogo /src/features/catalog/catalog-pages.js, commit informado 308b1d1 |
| Build Vercel local | dist/index.html y dist/src copiados del worktree staging; mismas rutas absolutas /src y fetch relativos /api |
| Vercel público | 404 en matebreak-staging.vercel.app; conector copplex1 informa 0 deployments |
| VS Code Run | Sin .vscode/launch.json o settings del proyecto; no hay proceso Live Server observado. Método/URL exactos aún sin confirmar |

La consola de localhost y Render mostró el aviso del CDN Tailwind; no se capturaron
errores de script. El DOM observado permite identificar los scripts y stylesheets
realmente cargados. No se dispuso de un waterfall completo con tiempos por recurso
del navegador; se midieron los GET HTTP del smoke por separado.

Normalizando CRLF/LF, Render, los archivos source staging y dist son idénticos
para index.html, header-account.js, header-fade.js y header-account.css.
No hay un header alternativo generado por el build. Los entrypoints antiguos de
catálogo/cuenta de staging son wrappers de compatibilidad hacia src/features;
no prueban por sí mismos doble ejecución. Los headers están repetidos en páginas
HTML y se inicializan por vías distintas: import dinámico en header-fade frente
a módulo directo en páginas de comercio. Esto amplía el riesgo de inconsistencias.

Render sirve la web desde / por server/app.mjs: express.static('/src') y sendFile
explícito de index.html. Es el modo monolítico/fallback del backend; Vercel servirá
su copia estática y sólo enviará /api, /auth, /interno y /healthz hacia Render.
No es necesario modificar la raíz Render desplegada para diagnosticarlo.

APP_ORIGIN está configurado para el frontend HTTPS de Vercel. Abrir formularios
directamente desde el dominio Render no equivale al flujo final: su Origin es
distinto y las guardas pueden rechazar POST de compra/Auth. No se enviaron esos
POST en la auditoría. Los cookies/cart de localhost, Render y Vercel también
pertenecen a orígenes distintos; no se debe esperar que compartan sesión o cantidad.

## Caché, SW y Render Free

No se encontraron registros serviceWorker ni uso de CacheStorage en el código.
No se auditó un posible registro antiguo de SW en el perfil del usuario.
Render usa no-store para los documentos/API, y la configuración preparada de
Vercel usa no-store. La caché local de recursos puede acortar la ventana del
header, pero no es necesario un deployment antiguo para explicar el síntoma.
Tailwind CDN es un script externo bloqueante en el head; las fuentes también
son externas. Su tiempo de carga puede retrasar el documento y su inicialización.

Render Free puede dormir tras 15 minutos y tardar aproximadamente un minuto en
reactivarse. Esto puede retrasar la carga desde Render y los datos /api desde
Vercel. Las muestras del smoke fueron rápidas; no se forzó un cold start.
La aparición del enlace Mi cuenta no espera al backend: el cold start no es
la causa de esa transformación estructural.

## Corrección propuesta antes del primer frontend definitivo

Mantener Mi cuenta y carrito funcionales en el HTML desde el inicio, con href
/mi-cuenta y /carrito y una única definición compartida de sus iconos/estructura.
Cargar su CSS declarativamente en el head. Reservar JS para actualizar estado
Auth y cantidad; esos requests no deben construir la navegación.
Unificar el entrypoint y evitar que header-fade sea responsable de funcionalidad
de compra. Probar primera carga sin caché, JS lento, API lenta/offline, navegación
normal y regreso desde historial; links estables sin loaders artificiales.

Esta iteración documenta la causa y prepara hosting. No se implementó aún esa
corrección del header ni se certifica que el build actual evite el flash:
al copiar los mismos archivos, Vercel heredaría el comportamiento.

## Fuentes

- https://render.com/docs/free#spinning-down-on-idle
- Observaciones de DOM/Console, lecturas HTTP y código local del commit staging.
