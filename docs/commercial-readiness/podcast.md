# Podcast — contenido real y reproductor bajo acción del visitante

Actualización editorial desde el RC b722cab9fe6600b6beb3d1932c29a31b7169a239. La página conserva el header, identidad, Geist/Inter, superficies, radios y responsive MateBreak. No contiene captura de voz, grabación, getUserMedia, IA o transcripción. El micrófono del header sigue siendo un enlace accesible de navegación; microphone=() permanece.

## Contenido verificado

Canal oficial: https://www.youtube.com/@MATEBREAKPODCAST/videos. El video aportado https://www.youtube.com/watch?v=-wjfvhQcifk&t=1402s corresponde a «Cómo Vender Miles de Productos por Internet | Álvaro de Voltra - #12» (YouTube oEmbed y listado del canal verificados el 5/10/2026). Se destaca arriba desde start=1402, 23:22. Se verificaron títulos, numeración, IDs y miniaturas oficiales de episodios 1–13; la grilla muestra 1–11 y 13 en orden, excluyendo 12. No se incluyen fechas, duraciones o invitados inferidos.

## Privacidad, seguridad y fallback

El reproductor se crea sólo al activar Cargar video con clic/teclado, mediante iframe nativo en https://www.youtube-nocookie.com/embed/-wjfvhQcifk?start=1402&autoplay=0&controls=1&playsinline=1&rel=0. Sin SDK remoto, enablejsapi ni autoplay. Título accesible; allow sólo encrypted-media, picture-in-picture y fullscreen; referrerpolicy strict-origin-when-cross-origin conserva Referer requerido por YouTube. No permisos de micrófono/cámara. Las miniaturas reales se solicitan a i.ytimg.com con no-referrer; pueden transmitir IP al proveedor. Privacy Enhanced no promete ausencia absoluta de tracking/cookies: reproducción/enlaces externos se rigen por YouTube.

Referencia oficial: https://support.google.com/youtube/answer/171780?hl=es. Se añade únicamente frame-src https://www.youtube-nocookie.com a la CSP de /podcast y /src/pages/podcast.html, tanto Express como Vercel. Las demás rutas conservan publicCsp estricta; no se amplían script-src/connect-src/img-src, no wildcard ni dominios Google adicionales. img-src https: era preexistente y no se amplió. Permissions-Policy camera=(), microphone=(), geolocation=() se conserva. Los headers Vercel generados son validados estrictamente, incluyendo las dos excepciones exactas.

Enlace Ver en YouTube con timestamp siempre visible, incluyendo sin JS o si el iframe/proveedor no responde. No se intenta atravesar autenticación, CAPTCHA, bloqueo regional o política de YouTube. Las tarjetas son enlaces HTML normales con títulos reales, thumbnails lazy, foco visible y rel noopener noreferrer. Reproductor 16:9; grilla de 3/2/1 columnas según responsive existente. Tests mantienen assertions de overflow, header, anchor y accesibilidad.

## Validación y publicación

300 pruebas unitarias; suite Podcast nueve viewports; regresión responsive de 263 layouts/48 escenarios contra Express/Supabase locales reales, sin interceptaciones. Ocho tamaños del pedido prueban títulos/miniaturas, proporción, carga explícita y controles nativos; prueba de reproducción/posición efectiva se registra por separado, sin equiparar HTML cargado con video reproducido. Reportes externos de esta fase registran SHA/CI y resultados Cloud exactos, para evitar referencias circulares en el commit.

Build con Node 22, auditor público de 181 archivos, locks/migraciones históricas preservados. Supabase Staging ya tiene 39 migraciones del RC anterior; esta corrección no requiere DDL, cambios comerciales ni Storage. MP/MiCorreo/Resend reales y workers comerciales continúan OFF/mock. PR #4 sigue OPEN/DRAFT; no main/producción/DNS/Tiendanube/merges.

## Home — diagnóstico, sin modificación

60 frames en repositorio, build publicado y Staging, con hashes coincidentes y 0 errores HTTP de frames. No dependen de Supabase Storage. En desktop de 1440 px sin reducción de movimiento, los frames cambian con scroll; no es reproducción autónoma en reposo. En móvil ≤760 px y reduced-motion se conserva primer frame y no se precarga/analiza secuencia completa. El Home abierto por el titular en el navegador interno medía 724 px: aplica protección móvil y animation:none. No faltan frames, no se duplicaron imágenes y no se modificó Home/scroll-sequence/responsive.

## Traspaso

Actualizar sólo Staging tras CI/gates y reconstruir artefacto desde el SHA final. Registrar deployment y baseline antes/después. Fotografías del catálogo comercial y su capacidad siguen pendientes, pero no causan inmovilidad de esta secuencia. Detener al completar validación; no encadenar producción ni activaciones comerciales.

La comprobación de consola identificó el favicon predeterminado ausente (404 preexistente). Podcast declara ahora el logo PNG local existente como favicon, sin agregar assets ni dominios. YouTube puede emitir una advertencia propia por compute-pressure denegado; ese permiso continúa bloqueado y no se amplía Permissions-Policy.
