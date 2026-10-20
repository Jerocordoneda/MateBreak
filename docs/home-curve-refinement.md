# Ajuste fino de la curva del home

Base: `b4a2039`, rama local `codex/frontend-recovery`. Se conserva el candidato
anterior y su layout; este cambio está limitado a la transición del home.

## Comportamiento

Se inspeccionó https://www.go-marz.com en Chrome real, incluyendo el cruce de
fondo claro a oscuro alrededor de su sección de creadores. El borde central
con halo emerge antes que los extremos y la superficie inferior avanza al
desplazarse. Se adaptó esa sensación al claro y dorado propios de MateBreak.

La curva mantiene ancho, altura y radios del candidato. Ahora puede sobresalir
por arriba del contenedor: se elimina el recorte que aplanaba el arco. Los
lados y la base siguen recortados para evitar overflow horizontal y no cubrir
el contenido de la sección siguiente. Se recupera el borde dorado de 2 px con
las tres capas suaves de iluminación de `style.css`.

El recorrido aumenta de 38% a 65% de la altura del contenedor y usa smoothstep
para entrar y terminar suavemente. La posición depende directamente del scroll,
sin inercia ni animación permanente. Con `prefers-reduced-motion: reduce`, la
traslación adicional permanece en cero y el borde sigue al documento.

## Contacto con el header

El primer punto visible de contacto es el ápice central de la curva, cuyo borde
superior se obtiene con `curve.getBoundingClientRect().top`. El header ocupa el
ancho del viewport; el contacto se cumple cuando ese valor alcanza
`header.getBoundingClientRect().bottom`.

Ya no se usa el centro del header ni se limita el ápice al borde del contenedor.
El evento `mb:transition` pinta el header en el mismo frame que mueve la curva.
Solo se escribe el tema si cambia su estado. La misma condición geométrica se
aplica al invertir el scroll: al separarse el borde, vuelve el tema anterior.
Textos, iconos y navegación pasan a negro `#171815` sobre fondo claro; no cambia
ninguna caja, posición, altura o estructura del header.

Las reglas nuevas y la mecánica nueva se limitan a `[data-home]`. Las demás
páginas conservan sus curvas y criterio de cambio de color previos.

## Archivos

- `src/js/script.js`: recorrido suave de la curva del home.
- `src/js/header-fade.js`: contacto real y actualización coordinada.
- `src/css/responsive.css`: recorte y glow del home.
- `src/css/public-header.css`: contraste negro del home al contactar.
- `scripts/verify-home-curve.mjs`: prueba y capturas comparativas nuevas.
- `scripts/verify-frontend-recovery.mjs`: su expectativa de contacto se actualiza
  del centro del header a su borde inferior, conforme al nuevo requisito.
- Este informe.

No se modifican `index.html`, secuencia/assets del mate, catálogo, tarjetas,
carrito, CTA, badge, búsqueda, submenús, backend, SQL, seguridad ni infraestructura.

## Validación

- Build completo PASS; origen staging suministrado solo al proceso.
- Suite existente: 342/342 PASS.
- Regresión existente del header sobre `dist`: 145 mediciones y 5 comprobaciones
  de navegación/scroll PASS.
- Comparación Chrome antes/después: 390, 768 y 1440 px, con movimiento normal y
  reducido. Los cuatro archivos previos se sirven directamente desde Git
  `b4a2039`, con el mismo HTML, recursos y snapshot público en ambos candidatos.
- Se verifican el halo dorado, ascenso por encima del contenedor, ausencia de
  overflow, contacto a ±1 px en ambos sentidos, estabilidad en reposo, búsqueda
  global y geometría idéntica de header, hero, mate y tarjetas.
- Sin errores JavaScript. El flotado decorativo del mate se congela únicamente
  en las capturas comparativas; su implementación permanece intacta.

Evidencia externa al commit: `outputs/curve-refinement/` en el checkout original.
`comparativa.html` reúne antes/después y capturas a un píxel del contacto;
`proof/curve-proof.json` contiene las medidas reales y resultados de seis casos.
También se guardan las capturas de Marz, logs de build, suite y header.

Para repetir: definir `MATEBREAK_BROWSER_MODULE` (Playwright),
`MATEBREAK_CATALOG_SNAPSHOT` (snapshot público con fotos locales) y
`MATEBREAK_CURVE_PROOF` (directorio externo). Ejecutar
`node scripts/verify-home-curve.mjs` desde este worktree.

Todo queda local: no se realiza push, merge, deploy ni modificación del PR #4.
