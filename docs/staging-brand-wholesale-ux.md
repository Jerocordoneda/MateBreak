# UX pública y solicitud mayorista

Bloque B, separado del contrato de providers Mercado Pago TEST del bloque A.
Se reutilizan la marca local oficial de MateBreak, componentes y estilos
existentes. No cambian precios comerciales, stock, mínimos, RPC ni migraciones.

## Cambios

- Logo oficial local en las marcas existentes, enlace al Inicio y área de foco
  y toque de al menos 44px. El módulo compartido completa la marca de las
  páginas Auth que sólo tenían un texto, conservando el layout actual.
- Favicon local y título MateBreak en todos los HTML públicos. Los dos alias
  históricos que redirigen al catálogo conservan sus redirecciones.
- Mayorista abre primero el catálogo. Se retira el formulario inicial de
  completar perfil, conservando la validación y RPC de perfil del backend.
  Continuar abre el formulario existente con los valores de Mi Cuenta y pide
  los requeridos faltantes. Revisar datos permite editar los valores cargados;
  la solicitud guarda su snapshot sin modificar automáticamente el perfil.
- Cantidad inicial vacía equivale a cero. Se normalizan ceros iniciales al salir
  del campo y se conserva el rango de enteros 0–1000. La edición invalida la
  cotización anterior inmediatamente y consulta SQL tras 150ms de pausa.
  Actualizar continúa disponible como reintento explícito.
- La respuesta de cotización determina el tramo combinado, precios de todas
  las tarjetas, subtotales seleccionados y resumen. Respuestas anteriores no
  reemplazan una selección nueva. Confirmar vuelve a calcular en PostgreSQL.
- El checkout diferencia visualmente el transporte Mercado Pago TEST del
  circuito mock persistido. No llama TEST-LOCAL a una preferencia de MP.
- README: stack real, badges discretos y arquitectura frontend/BFF/PostgreSQL;
  Python queda como tooling auxiliar, PL/pgSQL como lógica de base de datos.
  No se modifica .gitattributes ni Linguist.

## Firma Copplex: bloqueada

La búsqueda en el repositorio y el checkout original no encontró un asset
oficial de Copplex. Se corrigieron los créditos antiguos de footer
«Crafted for CODDLEX» que aludían a la autoría de la web. No se generó, descargó
ni publicó un logo provisional ni se implementó una firma con un asset supuesto.

El titular debe proporcionar el logo oficial para completar la firma global
«Desarrollado por [logo]», enlace exacto https://www.copplex.com, accesibilidad y
verificación de todos los footers. Sus pruebas de presencia del logo/enlace
permanecen BLOCKED, no PASS. No se fuerza un footer público en layouts internos.

## Reproducción y alcance de las pruebas

- `npm test`: guards, cantidades, favicon/asset/títulos y contratos existentes.
- `node tests/public-branding-browser.mjs`: 27 recorridos × 7 anchuras,
  HTTP/Express/SQL local, sin interceptaciones de APIs.
- `node tests/wholesale-completion-browser.mjs`: 320, 360, 390, 430, 768,
  1024 y 1440; cotizaciones reales en SQL local, selección combinada,
  tarjetas/total, formulario posterior al CTA, datos faltantes y refresh.
- `node tests/wholesale-account-browser.mjs`: desktop/mobile, Auth sintético y
  SQL local. La pérdida de respuesta se intercepta expresamente para probar
  idempotencia; no es validación de una caída Cloud ni de Supabase Auth real.
  Se respeta el rate limit entre escenarios o se ejecuta cada anchura en un
  proceso independiente mediante MATEBREAK_BROWSER_WIDTH.
- `node tests/responsive-local-browser.mjs`: matriz de comercio y cuenta sobre
  Supabase Auth/PostgREST y Express locales, sin interceptaciones; fixtures
  sintéticos exclusivamente locales. Usa seed-responsive-local.mjs y
  preview-manual-review-local.mjs, con reset local y limpieza al terminar.

Los browser scripts requieren MATEBREAK_PLAYWRIGHT_MODULE y una carpeta externa
MATEBREAK_EVIDENCE_DIR. No ejecutar fixtures contra Staging Cloud. Las capturas
locales no acreditan navegación autenticada, compras, emails o MP reales Cloud.
La publicación de estos cambios frontend requiere un prebuilt Vercel Staging
del mismo SHA validado en Render; el bloqueo del contrato MP también detiene
esa publicación coordinada.
