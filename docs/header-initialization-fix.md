# Corrección de navegación inicial — 2026-10-01

Rama: codex/staging-preparation. Corrección local; sin push ni deploy.

## Cambio

Las 22 páginas de contenido incluyen exactamente un acceso Mi cuenta (/mi-cuenta)
y uno a carrito (/carrito), con sus SVG y contador en el HTML inicial.
Las dos páginas de redirección conservan sus redirects hacia el catálogo.
Las barras públicas mantienen sus clases responsive, colores y animaciones;
cuenta y carrito conservan su diseño sin un header de navegación adicional.
El logo de las páginas de compra también está completo en el HTML.
header-account.css se carga una única vez desde el head de cada página.
No se modificaron las hojas de estilos, colores ni breakpoints existentes.

header-account.js actualiza únicamente estado del contador y atributos accesibles.
Se eliminaron la construcción de enlaces/iconos/logo, la inyección de CSS y las
importaciones del módulo desde header-fade, cuenta y carrito. Cada HTML declara
un único entrypoint module. La capa decorativa del fade está en el HTML; el JS
de animación actualiza estilos sin construir elementos del header.

Se conserva BroadcastChannel, eventos mb:cart, pageshow y visibilitychange.
Un contador lento usa timeout de 10 segundos, conserva el último valor conocido
y puede volver a consultar en futuras activaciones. Una respuesta antigua no
sobrescribe un cambio de carrito recibido mientras estaba pendiente.
Auth mantiene sus flujos existentes; el enlace Mi cuenta no espera a la sesión.
No se añadieron loaders ni se retrasa la visualización.

npm run build es ahora un alias de npm run build:staging: conserva la guarda
STAGING_BACKEND_ORIGIN. La preparación local de Vercel permanece dirigida a
https://matebreak-api-staging.onrender.com con /api, /auth, /interno y /healthz.

## Validación

- Node 22.23.3: 165 tests existentes y 2 nuevos = 167/167 PASS, sin omisiones.
- npm run build PASS, salida dist y comprobación del origen HTTPS aprobado.
- Chrome 154, contextos nuevos sin caché y sin Service Workers de otros perfiles.
- Las 22 páginas completas con JS deshabilitado: enlaces visibles y funcionales,
  un solo acceso de cada tipo y stylesheet presente en head.
- Módulo del contador retenido por una barrera de red: navegación visible antes
  de liberarlo, sin reconstrucción de iconos tras su carga.
- Visitantes y sesión autenticada simulada: cuenta/carrito y navegación de regreso
  desde historial sin accesos duplicados. Los tests existentes cubren permisos Auth.
- API lenta: enlaces disponibles y respuesta vieja incapaz de pisar cantidad nueva.
- API temporalmente inaccesible (503): home, catálogo, cuenta y carrito mantienen
  accesos. En móvil de 360px ambos enlaces siguen visibles dentro de la pantalla.
- CSS y animación conservadas; revisión visual local del header desktop/móvil.
  Las pruebas aislaron assets externos: fuentes/logos remotos no se certifican
  visualmente en esas capturas; sus URLs y estilos originales no se cambiaron.

Las pruebas de navegador usaron un servidor HTTP local y datos en memoria.
Se sirvió una copia local del script público Tailwind para conservar los estilos
en las pruebas; los restantes requests externos se bloquearon. Cero escrituras,
cero llamadas a Render/Supabase/proveedores y ninguna cuenta remota creada.
Scripts/capturas/logs completos del harness permanecen locales fuera del repo.
Los dos tests de navegación inicial sí se incluyen en el repositorio.

## Inspección del build

dist contiene únicamente index.html y src/. Sin server, SQL, supabase, docs,
evidencias, logs o archivos .env. Scan de secret keys, access tokens, JWT y URLs
DB con contraseña sin hallazgos. No se cargaron credenciales reales.
La .vercelignore preparada también excluye datos privados de la subida CLI.
El análisis por patrones complementa la allowlist; no es una certificación universal.

## Alcance del commit

El commit de esta corrección incluye sólo HTML/JS del frontend, los dos tests,
este informe y el alias build. Los cambios anteriores de configuración de hosting,
Node 22.x y otros informes quedan pendientes localmente para revisión/publicación
separada. Las pruebas de build usaron el worktree completo, incluidos esos rewrites.

No se modificaron backend, Render, Supabase, migraciones ni proveedores. No se
conectó GitHub a hosting y no se publicó o desplegó ninguna versión nueva.
El procedimiento manual vigente está en staging-vercel-first-deploy.md y debe
ejecutarse sólo después de la autorización y revisión de todos los cambios necesarios.
