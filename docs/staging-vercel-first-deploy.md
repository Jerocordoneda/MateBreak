# Preparación del primer deploy manual Vercel — pendiente de autorización

Scope copplex1; proyecto matebreak-staging.
Project ID prj_CrDsy4AToxUT27bCsEbuaDmAceJh.
Backend confirmado https://matebreak-api-staging.onrender.com.
Alias previsto https://matebreak-staging.vercel.app; actualmente responde 404.
Consulta de lectura final: el conector confirma el Project ID, accountId team_lIiIUZEuCy5NAdctFIrl8mt8 y cero deployments. No se ejecutó deploy, promoción, link ni conexión Git.

## Cambios locales preparados

- vercel.json contiene rewrites externos explícitos de /api/:path*, /auth/:path*,
  /interno/:path* y /healthz al mismo path del origen HTTPS Render confirmado.
- Los rewrites internos de tienda/carrito/checkout/productos/cuenta siguen estáticos.
- git.deploymentEnabled=false: sin despliegues por Git. No conectar GitHub.
- Install Command npm ci; Build Command npm run build; Output Directory dist;
  Framework Other (null); Root Directory '.'; Node 22.x.
- package.json y lockfile limitan engines.node a 22.x; el >=22 anterior podía
  seleccionar Node 24 en Vercel aunque el Dashboard indicara 22.
- .vercelignore excluye .env, backend, SQL, evidencias/logs y metadatos locales
  de la subida del frontend. El build copia únicamente index.html y src/.

La corrección local del header incorpora npm run build como alias de build:staging;
ambos conservan la guarda del destino. No sustituirlo por build:frontend.
El build se verificó en Node 22.23.3 y produjo dist; 167/167 tests aprobados
(165 existentes y dos nuevos). Ver header-initialization-fix.md.
Se revisó dist por allowlist y patrones de secret keys/tokens/JWT: sin hallazgos.
La validez end-to-end de los rewrites en Vercel sólo puede comprobarse tras deploy.

## Antes de autorizar

Revisar header-initialization-fix.md: los accesos y estilos ya están en el HTML
inicial del source y dist. La corrección y sus pruebas son locales, sin publicar.
Los cambios locales no se publicaron ni alteraron el deploy Render 308b1d1.
Revisar el diff y seleccionar explícitamente qué archivos serán versionados.

## Procedimiento manual, ejecutar sólo después de autorización

1. En el Dashboard, abrir exclusivamente matebreak-staging en copplex1 y confirmar
   Project ID, Node 22.x, Other, raíz '.', npm ci, npm run build y dist.
   Mantener el proyecto sin integración Git.
2. Agregar STAGING_BACKEND_ORIGIN=https://matebreak-api-staging.onrender.com como
   variable de build para el entorno del proyecto Staging. Es pública.
   No cargar claves Supabase, access tokens o credenciales de proveedores en Vercel.
3. Trabajar desde el worktree staging revisado. Usar vercel login por el flujo
   oficial si hace falta. Para enlazar sólo la carpeta al proyecto existente:

   ```powershell
   vercel link --scope copplex1 --project matebreak-staging
   $vercelBinding = Get-Content .vercel/project.json -Raw | ConvertFrom-Json
   if ($vercelBinding.projectId -ne 'prj_CrDsy4AToxUT27bCsEbuaDmAceJh' -or
       $vercelBinding.orgId -ne 'team_lIiIUZEuCy5NAdctFIrl8mt8') {
     throw 'Destino Vercel incorrecto: NO desplegar'
   }
   ```

   Verificar projectId prj_CrDsy4AToxUT27bCsEbuaDmAceJh y orgId
   team_lIiIUZEuCy5NAdctFIrl8mt8. Este link local no es vercel git connect.
   No aceptar crear otro proyecto ni enlazar otra organización.
4. Repetir localmente, con Node 22.x:

   ```powershell
   $env:STAGING_BACKEND_ORIGIN='https://matebreak-api-staging.onrender.com'
   npm ci
   npm run build
   npm test
   ```

5. Únicamente con autorización de despliegue y el ID verificado:

   ```powershell
   vercel deploy --prod --scope copplex1 --build-env STAGING_BACKEND_ORIGIN=https://matebreak-api-staging.onrender.com
   ```

   --prod designa el entorno y alias estable de ESTE proyecto staging independiente;
   no representa la tienda productiva. El primer deployment Vercel es Production
   del proyecto incluso sin ese flag. No ejecutar desde el checkout main.
   No usar --public ni conectar Git durante prompts.
6. Verificar URL, /healthz, /api/productos y producto sintético. Abrir /tienda,
   /carrito y /mi-cuenta, comprobar Network/Console y cookies seguras sin crear
   usuarios, pedidos o pagos. /auth/callback e /interno se verifican inicialmente
   por routing/controles de acceso, sin enviar callbacks o credenciales ficticias.
   El frontend usa el mismo origen y los rewrites preservan los paths del backend.

## Rollback

Antes del primer deploy no existe versión anterior. Si falla el build no hay
deploy Live nuevo. Si se publica una versión funcionalmente incorrecta, detener
pruebas y revisar la retirada/rollback del proyecto staging con autorización.
No modificar Supabase ni Render para ocultar un fallo de routing del frontend.

## Fuentes

- https://vercel.com/docs/cli/deploy
- https://vercel.com/docs/functions/runtimes/node-js/node-js-versions

## Estado final preparado

El estado de publicación debe incluir el commit aprobado del header
1a34753ba4fa945b28f2facfb8f03e39e58c3acf y el commit separado de hosting.
Los informes resumidos se versionan por separado. No subir logs crudos,
capturas completas, backups ni SQL de recuperación. .vercel/ está ignorado
por Git y por la subida. La CLI sólo necesita los tres scripts del build;
los demás scripts operativos quedan excluidos mediante .vercelignore.

No existe todavía binding local .vercel/project.json en este worktree:
la comprobación bloqueante del paso 3 es obligatoria antes del primer deploy.
El conector de listado no devuelve la configuración de la integración Git;
la guarda local git.deploymentEnabled=false está comprobada. Revisar en el
Dashboard que Git siga sin conectar; no se realizó ninguna conexión aquí.

Las pruebas locales no certifican los rewrites ejecutados en Vercel ni cookies
y sesiones a través del proxy: verificarlos tras el primer deploy autorizado.

Validación final repetida: npm ci con Node 22.23.3 aprobado; npm test
167/167, cero fallos/omitidos; npm run build aprobado. dist contiene 136
archivos, exclusivamente index.html y src/. Revisión por patrones de secretos
en 79 archivos de texto del build/configuración/informes: sin coincidencias.
Las reglas de subida se comprobaron para excluir SQL, backend, .env, .vercel
y capturas privadas, y conservar todos los inputs necesarios del build.
