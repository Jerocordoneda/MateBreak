# MateBreak — recuperación selectiva del frontend

## Base y alcance

Rama local `codex/frontend-recovery`, creada directamente desde
`595cc14736f03b6ca72beeb2b8e5fcf14de71370` en un worktree aislado.
Se verificaron el commit, las ramas que lo contienen y el PR #4: Draft,
head exactamente `595cc147`, check `node` de Security checks SUCCESS.
El diff contra `3415df1` confirmó que la rama anterior omitía trabajo reciente.
No hubo merge, reset, cherry-pick completo, push, despliegue ni edición del PR.

## Integración

- Tarjetas compactas, foto completa con `contain`, bordes alineados, precio real
  del DTO en cobre, sin «Desde», junto al +. En pantallas pequeñas se disponen
  horizontalmente para mantener el precio completo en una línea.
- Contador del catálogo visualmente oculto, conservado como anuncio accesible.
- El + consulta el detalle canónico, agrega solo una variante inequívoca y
  comprable con stock, y deriva opciones/personalización al detalle.
- El carrito usa los endpoints existentes. Una cola compartida serializa
  lectura e incremento entre tarjetas y detalle; el bloqueo por tarjeta evita
  doble clic. Se conserva personalización, manejo de errores y evento `mb:cart`.
- El resto de la tarjeta navega al detalle, respetando sus enlaces y selección
  de texto. La compra inmediata y la resolución de variantes no se modificaron.
- Hero: un único CTA Personalizá el tuyo; badge decorativo animado sin enlace
  ni flecha. Se conserva su ocupación vertical responsive para no mover el mate.
- Submenús del header aprobado: 12 px hacia la derecha y 22 px debajo del enlace,
  sin cambiar geometría de barras, acciones, navegación ni menú mobile.
- La capa blanca cubre progresivamente la oscura. El tema del header compara
  el borde renderizado y su recorte con el centro del rectángulo real del header.
  Actualización coordinada por evento, sin bucle de animación permanente.

## Cambios descartados de 3415df1

La nueva implementación táctil del mate, sus cambios de tamaño/posición/altura,
la eliminación de `mateFloat`, los cambios de preload y de movimiento reducido,
las disposiciones antiguas del header y los reajustes de geometría tablet.
Tampoco se recuperaron categorías/etiquetas comerciales antiguas en tarjetas,
precios que ignoraban el DTO ni reemplazos completos de archivos divergentes.

Se conservan sin cambios `public-header.mjs`, búsqueda global, servicios del
catálogo, selección de variantes, `scroll-sequence.js` y todos los recursos.
Backend, Supabase, pagos, envíos, inventario, reservas, seguridad, configuraciones
publicadas y pruebas existentes permanecen intactos.

## Validación

| Comprobación | Resultado |
|---|---|
| `npm run build` | PASS, origen staging suministrado solo al proceso |
| `npm test` | 342/342, incluyendo dos pruebas nuevas del carrito |
| Regresión existente del header sobre `dist` | 145 mediciones, 5 pruebas de navegación/scroll |
| Búsqueda/tarjetas existente sobre `dist` | 5 anchos, teclado, foco, respuestas tardías y reintento |
| Comparación contra la base | 320, 360, 390, 768, 1024, 1440 y 1920 px |
| API/cart aislado en navegador | incremento 1→2, doble clic, stock, opciones y personalización |
| Arquitectura | PASS: sin ciclos, imports/assets faltantes; 26 hashes históricos y lock de 40 migraciones |
| `npm run test:full` | Bloqueado: daemon Docker detenido y contenedor local requerido no disponible |

La comparación exige el mismo DOM interno y geometría del header; idénticos
rectángulo, tamaño, encuadre, fotograma y píxeles decodificados del mate.
Solo se congela el flotado decorativo durante las capturas para compararlas.
La animación real conserva su implementación original y sus pruebas existentes.
Las tarjetas verifican alineación de foto/cuerpo y que el precio no invada el +
en los 106 productos del snapshot. Se prueba el color real del header a cuatro
posiciones alrededor de la transición. No se detectaron errores JavaScript.

El navegador utiliza un snapshot público exportado y recursos locales; las
escrituras de carrito se limitan a una API simulada en loopback. Esto verifica
frontend y contrato, sin afirmar validación de una compra real en staging.
En 320 px, el borde derecho de la cuenta conserva el recorte presente en la
base; no se alteró la geometría aprobada para corregirlo. Las pruebas originales
del header cubren desde 360 px.

## Investigación de los fallos anteriores

Los cuatro fallos se reprodujeron en el checkout original ejecutando únicamente
`baseline-guards.test.mjs` y `local-test-guards.test.mjs`: 1 PASS, 4 FAIL.
`assertLocalTests()` lee primero `.env`; su SUPABASE_URL remoto causa el rechazo
en español antes de las guardas específicas cuyos mensajes en inglés esperan
los tests. La protección sí detiene la ejecución antes de conexiones/Docker.
En este worktree nuevo, sin copiar `.env` remoto, pasan sin cambiar tests ni guardas.

La migración `20260907203438_commerce.sql` tiene el mismo contenido SQL:

| Representación | SHA-256 |
|---|---|
| CRLF del checkout nuevo / hash histórico bruto | `59953ab62a3be591152b07d9c37d46089f26ef599cf0402126e29445416da19f` |
| LF del checkout anterior / blob Git / normalización de ambos | `f7e61cdbeee6fed73161299cb022fd414a2f9feb297f53c9dc901a18acd1cc13` |

El checkout nuevo tiene 21.152 bytes y 291 CRLF; el anterior 20.861 bytes y LF.
La auditoría histórica bruta depende del fin de línea del checkout. Aquí pasa;
el lock adicional valida el contenido normalizado. No se reparó ni modificó
esa dependencia de la auditoría, ni ninguna migración o snapshot histórico.

## Evidencia y reproducción

Las capturas y logs quedan fuera del commit, en el checkout original bajo
`outputs/frontend-recovery/`. `comparison/` contiene hero, mate y CTA de base y
candidato; tarjetas antes/después, búsqueda, submenús y transición por ancho.
`comparison.json` registra medidas y escrituras simuladas. `header/` y `search/`
contienen las pruebas existentes. El índice visual está en `comparativa.html`.

Para reproducir la comparación, suministrar rutas absolutas en:
`MATEBREAK_BROWSER_MODULE` (Playwright), `MATEBREAK_BASE_ROOT` (checkout limpio
del commit base), `MATEBREAK_CATALOG_SNAPSHOT` (snapshot público completo con
imágenes locales) y `MATEBREAK_RECOVERY_PROOF` (directorio externo de evidencia).
Ejecutar `node scripts/verify-frontend-recovery.mjs` desde esta rama.

El checkout original conserva `warp/visual-fixes`, su commit `3415df1`,
`.env.example` modificado y `outputs/` fuera de commits.
