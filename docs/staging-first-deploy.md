# Primera publicación staging: valores y gates finales

Este documento complementa `docs/staging-deployment.md` y reemplaza sus instrucciones antiguas sobre `vercel.staging.generated.json`. No se realizó ningún despliegue ni operación remota en Supabase. PR #3 ya fue integrado; PR #2 continúa abierto y main no se integra en esta iteración.

## Identidad autorizada

Proyecto staging creado manualmente e informado por el responsable: **matebreak-staging**, referencia **rxccjczyywhewqqdfgxm**, URL **https://rxccjczyywhewqqdfgxm.supabase.co**, región **Oregon (US West)**, Healthy, sin migraciones y sin GitHub Integration. Estos datos provienen del responsable; no se consultó la base remota para validarlos. La identidad se debe confirmar otra vez en el dashboard antes de cualquier operación futura. Producción permanece separada y Deploy to production OFF.

La rama para ambos servicios es **codex/staging-preparation**. Conserva los commits `f79c890` y `476a174`, la arquitectura modular de `7e02c3e` y el consolidado `16b8a45`. La publicación de esta rama está autorizada; publicar no autoriza desplegarla ni migrar una base.

## Pantalla Vercel

| Campo | Valor exacto |
| --- | --- |
| Team | copplex |
| Project Name | matebreak-staging |
| Repository | Jerocordoneda/MateBreak |
| Framework | Other |
| Root Directory | ./ |
| Build Command | npm run build:staging |
| Output Directory | dist |
| Install Command | npm ci |
| Node.js | 22.x |
| Production Branch / Branch Tracking | codex/staging-preparation |

No existe el script genérico `npm run build`. La rama contiene `vercel.json` en la raíz, con rutas estáticas, noindex y Git auto deploy apagado. Mientras falta la URL real de Render, no contiene destinos externos ficticios y **build:staging falla deliberadamente**. No usar `.invalid` ni adivinar el subdominio del servicio: Render puede asignar un sufijo.

Después de recibir la URL HTTPS confirmada de Render (sin path/barra final), preparar el archivo localmente en PowerShell:

```powershell
$env:STAGING_BACKEND_ORIGIN = '<ORIGEN_HTTPS_RENDER_CONFIRMADO>'
npm run configure:staging:frontend
npm run build:staging
```

Estos comandos sólo preparan archivos y build local; no contactan Render ni despliegan. Revisar y publicar `vercel.json` antes de aprobar el primer deploy. El build **no reescribe la configuración**: Vercel resuelve el root config antes de ejecutar el build. Se rechazan URLs HTTP, localhost, placeholders, hosts Supabase y la tienda real como backend. También se bloquea el build si los rewrites no coinciden con `STAGING_BACKEND_ORIGIN`.

El archivo definitivo tendrá estos proxies: `/api/:path*`, `/auth/:path*`, `/interno/:path*` y `/healthz` hacia el mismo origen Render staging. Rutas estáticas: `/tienda`, `/carrito`, `/checkout`, `/checkout/resultado`, `/productos/:slug`, `/mi-cuenta`, además de `/` y archivos de `src`. No añadir catch-all de SPA sobre las rutas Auth/API.

Auto deploy: mantener `git.deploymentEnabled: false` en el root config de esta rama y comprobarlo en cada revisión. Esto desactiva despliegues originados por Git; no impide pulsar Deploy manualmente ni evita por sí solo el primer despliegue al importar un proyecto. Para cambiar la rama: Settings → Environments → Production → Branch Tracking. El entorno llamado Production pertenece al proyecto independiente matebreak-staging. No seleccionar main ni conectar dominios de la tienda real. No finalizar la pantalla de importación/Deploy sin autorización específica.

## Pantalla Render

| Campo | Valor exacto |
| --- | --- |
| Source / Repository | Jerocordoneda/MateBreak |
| Name | matebreak-api-staging |
| Language | Node |
| Branch | codex/staging-preparation |
| Region | Oregon (US West) |
| Root Directory | vacío |
| Build Command | npm ci |
| Start Command | npm start |
| Node Version (env NODE_VERSION) | 22 |
| Instance Type | Free |
| Health Check Path | /healthz |
| Auto-Deploy | Off |

`deploy/staging/render.yaml` describe estos valores; es un template inerte fuera de la raíz. **Importar un Blueprint o finalizar la creación del Web Service puede iniciar el primer deploy**. No hacerlo todavía. Si el formulario permite Advanced → Auto-Deploy, seleccionar Off; comprobar después en Service → Settings → Auto-Deploy → Off. No elegir On Commit ni After CI Checks Pass. No crear Deploy Hooks, cron jobs ni workers todavía.

El proceso usa `PORT` de Render y escucha explícitamente en `0.0.0.0` fuera del modo local. `/healthz` confirma que Express está vivo, no que las 26 migraciones o Auth estén listos. Las rutas del runtime se resuelven desde los módulos; no contienen rutas absolutas Windows ni requieren Docker. Docker/Supabase CLI locales pertenecen a herramientas de desarrollo, no al runtime HTTP.

Datos de negocio/reservas/pagos mock/carritos persistentes van a Supabase; imágenes a Storage, no al filesystem Render. El limiter reside en memoria y se reinicia con el proceso. SIGTERM/SIGINT drena conexiones HTTP con límite de 25 segundos. Transacciones e idempotencia SQL son la base de la recuperación; no afirmar continuidad perfecta sólo con ese cierre.

No habilitamos `trust proxy`: los headers X-Forwarded-* no se usan para autorizar usuarios o manipular Origin. Las cookies Secure se deciden por APP_ORIGIN HTTPS y la sesión se verifica con Auth. CORS permanece cerrado a mutaciones de otro Origin; el frontend usa llamadas relativas pasando por Vercel. Probar que Vercel conserva Set-Cookie y redirects. El limiter observa la dirección del proxy; medir falsos 429 desde varios clientes antes de validarlo y revisar una solución compartida antes de escalar. No agregar Domain a cookies ni abrir CORS con wildcard.

**Free es una prueba inicial**, no un backend permanentemente activo: duerme tras 15 minutos sin tráfico y puede tardar alrededor de un minuto en despertar; pierde archivos locales/reinicia procesos. La API ejecuta el job existente de vencimiento de reservas al arrancar y cada minuto mientras está activa. Cuando duerme el job no corre: la siguiente activación puede reconciliar expiraciones con retraso. No crear pings artificiales, cron ni otra automatización para evitar esa limitación. Es obligatorio probar expiración/reinicio antes de aprobar flujos completos. El worker logístico no corre dentro de la API: no se crea ningún worker, real ni mock. Por tanto, la importación asíncrona queda pendiente hasta un servicio mock separado y una autorización posterior; Free no admite background workers. El template de worker pago queda sólo como referencia futura y su código es exclusivamente mock.

## Matriz definitiva de variables

Todas las cargas manuales deben verificar primero el proyecto/servicio correcto. No usar `.env` original ni variables compartidas con producción. No hay SESSION_SECRET adicional: las credenciales de sesión provienen de Auth y las cookies configuradas por el servidor.

### Vercel: build/frontend

| Nombre | Valor/finalidad | Clasificación | Responsable |
| --- | --- | --- | --- |
| STAGING_BACKEND_ORIGIN | URL HTTPS exacta de Render staging; todavía pendiente | Público | Carga manual cuando se confirme la URL; mismo valor que vercel.json |

Configurar el valor en los entornos Vercel que se vayan a usar en este proyecto staging; si se hace un preview aprobado, asignarlo también a Preview. No cargar ninguna clave Supabase secreta, password DB ni token administrativo. El frontend actual llama al backend y no necesita clave Supabase en su bundle.

### Render: backend privado

| Nombre | Valor/finalidad | Clasificación | Responsable |
| --- | --- | --- | --- |
| NODE_VERSION | 22; runtime Node | Público | Manual |
| APP_ENV | staging; activa guardas | Público | Manual |
| NODE_ENV | development; permite mocks con guardas staging/HTTPS | Público | Manual |
| SUPABASE_STAGING_PROJECT_REF | rxccjczyywhewqqdfgxm; identidad aprobada | Público | Manual |
| SUPABASE_URL | https://rxccjczyywhewqqdfgxm.supabase.co | Público | Manual |
| SUPABASE_PUBLISHABLE_KEY | Publishable key del proyecto staging, para Auth/SSR | Pública | Copiar sólo desde API Keys del proyecto staging; cargar en Render |
| SUPABASE_SECRET_KEY | Secret key exclusiva del proyecto staging, para operaciones del backend con autorización | **Secreta** | Copiar directamente de Supabase staging a Render Environment; nunca chat/commit/Vercel |
| APP_ORIGIN | Origen HTTPS estable de Vercel staging sin barra final, pendiente | Público | Manual; debe coincidir con Auth Site URL |
| SHIPPING_MODE | mock | Público | Manual |
| PAYMENTS_MODE | mock | Público | Manual |
| MATEBREAK_STAGING_PERSIST_MOCK | 1; SQL real de staging con proveedores simulados | Público | Manual |
| MOCK_PAYMENT_RESULT | approved inicialmente; rejected/pending sólo para escenarios aprobados | Público | Manual |
| MOCK_ORIGIN_POSTAL_CODE | 7000; simulación postal | Público | Manual |
| PORT | Puerto asignado por Render | Público | Render automáticamente; no fijarlo |

En Dashboard Supabase **matebreak-staging → Settings → API Keys**, obtener la Publishable key y la Secret key. La Publishable key se puede localizar también en Connect. Si falta una secret key, el responsable la crea exclusivamente en este proyecto y la copia directamente en Render. No revelar claves en capturas. Las claves modernas comienzan con los prefijos publishable/secret indicados por el dashboard; no copiar JWT signing secrets, password DB ni access tokens para reemplazarlas. Se prefieren las claves modernas; los aliases legacy soportados por el código no son necesarios aquí.

La referencia productiva conocida está bloqueada y SUPABASE_URL debe coincidir exactamente con la referencia staging. La guarda no puede inspeccionar offline qué proyecto emitió una clave: verificarlo manualmente en el dashboard. Se rechazan credenciales MP/MiCorreo y tokens de administración/URLs DB en runtime staging. No activar flags localhost ni proveedores reales. El worker real y las tareas externas siguen apagados.

### Supabase staging: ajustes del dashboard, no env vars de Vercel

| Ajuste/recurso | Valor/finalidad | Clasificación | Responsable |
| --- | --- | --- | --- |
| Project Name / Region | matebreak-staging / Oregon; ya creados | Público | Responsable; confirmar identidad otra vez |
| GitHub Integration | Sin conectar | Configuración | Mantener sin conectar |
| Auth Site URL | APP_ORIGIN exacto de Vercel, pendiente | Público | Manual después de URL confirmada |
| Auth Redirect URLs | APP_ORIGIN/auth/callback exacto | Público | Manual; sin wildcard productivo |
| Confirm email | Desactivado sólo para cuentas ficticias .invalid de este staging, o SMTP/buzones exclusivos de pruebas | Configuración | Elegir manualmente el escenario; no copiar usuarios/SMTP real |
| JWT signing keys | Administradas por Supabase | **Secretas** | No copiarlas a Render/Vercel |
| Database password | Elegida al crear staging; sólo acceso DB/CLI futuro | **Secreta** | Gestor del responsable; no runtime, chat ni logs |
| Storage product-images | Bucket/policies del baseline para imágenes de prueba | Configuración | Revisar/crear sólo en staging tras aprobación; no importar archivos personales |
| RLS/grants | Definidos por las migraciones verificadas | Seguridad | Aplicar sólo tras autorizar el plan del target staging |
| Usuarios/equipo admin | Crear cuentas ficticias después de fixtures y habilitar UUID staging verificado | Datos de prueba | Manual; nunca copiar identidades/roles de producción |

## Creación y migraciones Supabase: gate separado

La creación manual ya está completada según el responsable. Para crear de nuevo un staging desechable en el futuro: Dashboard → New project → organización elegida → nombre staging independiente → contraseña nueva en gestor → Oregon → plan revisado → Create project, realizado por el responsable. No clonar ni importar producción. Eliminar/recrear proyectos requiere autorización propia.

**Todavía no ejecutar los siguientes pasos remotos.** Son el procedimiento futuro para el target aprobado y requieren permiso explícito de migración:

1. Confirmar visualmente título matebreak-staging, referencia rxccjczyywhewqqdfgxm, URL exacta, estado Healthy y GitHub sin conectar. Confirmar que su historial de aplicación está vacío. Revisar el commit seleccionado y los 26 hashes en `docs/staging-evidence/consolidation.json`. No utilizar `.env` ni una conexión enlazada de otro proyecto.
2. Autenticar la CLI 2.118.0 en la sesión del operador sin incorporar credenciales a archivos publicados. La gestión CLI usa autenticación administrativa y eventualmente password DB **staging**; la Secret key de runtime no reemplaza esa autenticación. Revisar primero permisos del usuario y compatibilidad de los DDL/roles históricos en un proyecto gestionado nuevo.
3. Después de autorización para inspeccionar ese target, preparar una variable explícita y consultar el plan. Todos los comandos tienen la referencia fija; no agregar `--linked`, `--include-all`, `--include-seed`, `--yes` ni debug:

```powershell
$stageRef = 'rxccjczyywhewqqdfgxm'
if ($stageRef -ne 'rxccjczyywhewqqdfgxm') { throw 'Target staging incorrecto' }
node node_modules/supabase/dist/supabase.js migration list --project-ref $stageRef
node node_modules/supabase/dist/supabase.js db push --project-ref $stageRef --dry-run --skip-vault
```

4. Revisar las 26 migraciones cronológicas y presentar el plan sanitizado. El rehearsal local no acredita los permisos de este cloud nuevo. Si falla un GRANT/rol/DDL, detenerse; no elevar roles, reparar historial ni probar contra producción.
5. Sólo con autorización específica para aplicar ese plan, ejecutar:

```powershell
node node_modules/supabase/dist/supabase.js db push --project-ref $stageRef --skip-vault
```

6. Verificar el historial/objetos del proyecto staging, Storage/RLS/Auth. Antes de crear cuentas o pedidos, ejecutar el fixture sintético en el SQL editor del proyecto verificado: `SET matebreak.environment = 'staging';` y `deploy/staging/fixtures.sql` juntos. El fixture rechaza ausencia de marca y bases con usuarios/pedidos/ventas; no borrar datos para saltar esa protección. El baseline conserva histórico del catálogo público; el fixture oculta esas publicaciones y muestra sólo el artículo sintético. No se importan datos personales.
7. Crear cuentas ficticias, configurar URLs Auth y hacer la matriz funcional del manual. Nunca ejecutar migration repair remoto ni db push productivo. Registrar el target/commit y resultados sin secretos.

## Checklist antes de autorizar el primer deploy

Este checklist es una plantilla de aprobación, no una afirmación de infraestructura externa validada:

- [ ] Rama staging publicada; SHA de GitHub igual al SHA final de la entrega; CI verde.
- [ ] Proyecto Supabase staging creado e identidad reconfirmada (creación ya informada por el responsable).
- [ ] Plan SQL aprobado y 26 migraciones aplicadas únicamente a staging; fixtures sintéticos cargados.
- [ ] Render configurado con claves exclusivas staging y todos los mocks; no grupos de secretos productivos.
- [ ] URL HTTPS Render confirmada; no asumirla a partir del nombre.
- [ ] APP_ORIGIN estable de Vercel confirmado; Site URL/callback Auth coincidentes.
- [ ] vercel.json generado y revisado para esa URL; cuatro proxies correctos; git.deploymentEnabled false.
- [ ] Build staging con configuración real PASS; el build actual permanece bloqueado a falta de Render.
- [ ] Pagos mock y envíos mock; ninguna credencial real MP/MiCorreo.
- [ ] Worker real apagado; tampoco se crea worker mock/cron sin autorización adicional.
- [ ] Main/PR #2/Supabase productivo aislados; Deploy to production OFF; auto deploy Render Off.
- [ ] Autorización expresa del responsable para el primer deploy del commit exacto.

Que una cuenta/proyecto exista o que una rama se publique **no** autoriza el primer deploy. Render Free y Supabase vacío aún no permiten aprobar el checkout externo. Pruebas pendientes: conectividad del nuevo DB, permisos/RLS, proxies/cookies/redirects HTTPS, cold start/reinicio/vencimiento, catálogo/registro/carrito/checkout/pagos mock, roles, logística, errores, computadora y celulares. No marcar estos casos PASS con sólo tests locales.

## Validación local de esta preparación

165/165 tests Node; arquitectura sin ciclos/imports/assets faltantes; 120 fuentes con sintaxis verificada; hashes de las 26 migraciones sin cambios; baseline/catálogo histórico offline aprobados; npm audit sin vulnerabilidades; revisión por patrones de credenciales sin hallazgos; dist contiene sólo index.html y src, sin backend/env/node_modules ni endpoints productivos de datos. El smoke de runtime usa configuración sintética local y /healthz: no realiza consultas Supabase ni contacta proveedores. El build estático base PASS; el build staging real está **PENDIENTE/BLOQUEADO** por URL Render, y el rechazo de ese estado se probó. Los tests de configuración usan un origen sintético sólo en memoria; no se publica ese origen en vercel.json.

Los adapters reales existentes conservan sus URLs oficiales, pero no se activan en staging; la referencia productiva aparece como denylist y evidencia histórica, nunca como target del nuevo runtime. La revisión de secretos es por patrones y allowlist, no una certificación universal. Ver `docs/staging-evidence/final-*`. Docker/integración SQL completa ya validada en la iteración previa; no se repite al no modificar SQL ni checkout.

Fuentes oficiales consultadas: [Supabase API Keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase migraciones](https://supabase.com/docs/guides/local-development/database-migrations), [Render Free](https://render.com/docs/free), [Render Auto-Deploy](https://render.com/docs/deploys#configuring-auto-deploys), [Render Web Services](https://render.com/docs/web-services), [Vercel Git auto deploy](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments), [Vercel rewrites](https://vercel.com/docs/routing/rewrites).
