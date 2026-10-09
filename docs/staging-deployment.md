# MateBreak: primera publicación de pruebas

Actualización final: usar **[staging-first-deploy.md](staging-first-deploy.md)** para las pantallas actuales de Vercel/Render, la matriz por servicio y el target Supabase `rxccjczyywhewqqdfgxm`, creado manualmente por el responsable. El nuevo root `vercel.json` mantiene bloqueado el build hasta confirmar Render; no se utiliza el auxiliar generado de la versión anterior.

Estado: PR #3 integrado con autorización el 1 de octubre de 2026 en `local-supabase-validation` (`16b8a45cbe9b9955d2b844690836030335006d44`). PR #2 sigue abierto y sin autorización. No se crearon proyectos, desplegaron servicios ni ejecutaron escrituras remotas en Supabase. Rama local `codex/staging-preparation`: incorpora el consolidado mediante merge `34b732f`, preservando `f79c890` y `476a174` sin reescribirlos. Estos cambios adicionales todavía no tienen CI remoto ni forman parte de los PR #2/#3.

## Consolidación y autorizaciones

| PR | Base comprobada | Head comprobado | Resultado |
| --- | --- | --- | --- |
| [#3](https://github.com/Jerocordoneda/MateBreak/pull/3) | `local-supabase-validation` / `4870fc733d4dccac1dd714e6485e071430eb4b89` antes de integrar | `codex/modular-refactor` / `7e02c3e11ae164f43567b5165b270684986640c7` | Integrado como `16b8a45`; CI aprobado antes del merge |
| [#2](https://github.com/Jerocordoneda/MateBreak/pull/2) | `main` / `15c9d640075b52721d81be033ba647cef9f3988b` | `local-supabase-validation` / `16b8a45cbe9b9955d2b844690836030335006d44` | Abierto, mergeable, nuevo CI Node verde; sin autorización |

Supabase Preview figura SKIPPED en ambos. Deploy to production OFF y Automatic branching OFF se verificaron directamente en el dashboard autenticado antes del merge de #3; Vercel no estaba conectado. No se modificó ninguna opción. Antes de cada integración, el responsable debe confirmar que sigue desactivado.

La simulación `git merge-tree --write-tree` terminó sin conflictos para #3 y para el resultado combinado hacia main. Los 26 archivos de migración conservan sus SHA256 originales: ver `docs/staging-evidence/consolidation.json`. No hay migraciones nuevas en esta preparación. La simulación valida compatibilidad Git; la prueba local cubre comportamiento, pero no certifica permisos de un proyecto cloud nuevo.

Orden obligatorio:

1. Completado: autorización explícita, revisión de bases/heads/CI/automatizaciones y merge de #3 en `local-supabase-validation`.
2. Completado: nuevo head de #2 `16b8a45`, CI Node SUCCESS y 26 hashes intactos. El árbol consolidado coincide exactamente con la refactorización aprobada. Ver `docs/staging-evidence/pr3-postmerge-review.json`; requiere nueva revisión inmediatamente antes de cualquier integración futura.
3. Presentar el resultado y obtener autorización explícita para integrar #2 en main. Nunca interpretar la primera autorización como permiso para ambos merges.
4. Revisar y publicar por separado esta rama de preparación cuando se autorice; exigir CI verde en el commit que finalmente se seleccione para staging. Actualizar la rama de los templates si cambia la rama de publicación. Ningún hosting debe conectarse automáticamente a main ni a la tienda real.

## Arquitectura elegida

Vercel sirve el frontend estático; sus rewrites envían `/api`, `/auth`, `/interno` y `/healthz` al API persistente Node/Express en Render. Un worker Render independiente ejecuta exclusivamente importaciones logísticas mock. Supabase staging es un proyecto nuevo para PostgreSQL, Auth y Storage. Cada componente usa exclusivamente configuración staging.

| Criterio | Render | Railway |
| --- | --- | --- |
| Compatibilidad | Procesos Node 22 existentes; web service y background worker | Procesos Node existentes; servicios separados |
| Persistencia | API y worker pagos siempre activos; sin depender del disco local | Servicios persistentes; consumo según recursos |
| Escala | Instancias y tamaños; crecimiento predecible por servicio | Escala de recursos y réplicas; costo según uso |
| Secretos | Variables privadas/env groups; mantener grupo exclusivo staging | Variables por proyecto/entorno; mantener entorno independiente |
| GitHub | Deploy manual con `autoDeployTrigger: off` | Integración GitHub compatible, revisar desactivar disparadores |
| Operación/costo | Dos servicios pequeños con precio fijo fácil de presupuestar | Flexible; requiere controlar consumo y límites |

Se elige Render por el ajuste directo con API y worker y por su presupuesto inicial predecible. Railway es una alternativa viable si se prefiere consumo variable. La API inicial usa una instancia: el limiter actual es en memoria y observa la conexión del proxy. Validar 429 detrás de Vercel; no habilitar `trust proxy` sin revisar la cadena de proxies. Antes de múltiples réplicas se necesita un limiter compartido. No se requiere volumen persistente: datos en Supabase, nunca archivos de negocio en el disco efímero.

## Archivos preparados

- `deploy/staging/backend.env.example`: inventario de configuración sin secretos.
- `deploy/staging/render.yaml`: API, auto deploy apagado, health check.
- `deploy/staging/render-worker.yaml`: worker opcional, auto deploy apagado.
- `deploy/staging/vercel.template.json`: copia del root config bloqueado, sin backend ficticio.
- `scripts/build-staging.mjs`: valida vercel.json contra STAGING_BACKEND_ORIGIN antes de generar dist; no reescribe rutas durante build. `scripts/configure-staging-frontend.mjs` prepara el root config offline después de recibir la URL real.
- `deploy/staging/fixtures.sql`: carga manual y transaccional de catálogo/stock sintéticos, fuera del historial de migraciones.
- `server/config/staging.mjs`: rechazo previo a conexiones de la referencia productiva conocida, URLs incompatibles y proveedores reales.
- `server/staging-worker.mjs`: worker mock sin opción de activar MiCorreo real.
- `tests/staging.test.mjs`: aislamiento, cookies/Origin y checkout persistente.

`NODE_ENV=development` permite los proveedores mock existentes; `APP_ENV=staging` impone HTTPS, HSTS y validaciones específicas. No representa una habilitación del modo productivo. El checkout persistente exige Auth, usa el ciclo SQL de reservas/pagos y conserva la devolución de stock en errores/vencimientos. El carrito efímero de pruebas anterior sigue disponible sólo en sus configuraciones anteriores.

## Variables

| Variable | Destino | Valor/configuración requerida |
| --- | --- | --- |
| `NODE_VERSION` | Render | `22` |
| `APP_ENV` | API y worker | `staging` |
| `NODE_ENV` | API y worker | `development` |
| `APP_ORIGIN` | API y worker | Origen HTTPS exacto y estable de Vercel staging, sin barra final |
| `SUPABASE_STAGING_PROJECT_REF` | API y worker | Referencia del proyecto staging nuevo; nunca la productiva |
| `SUPABASE_URL` | API y worker | `https://<STAGING_REF>.supabase.co`, debe coincidir con la referencia |
| `SUPABASE_PUBLISHABLE_KEY` | API y worker | Clave publicable únicamente del nuevo proyecto |
| `SUPABASE_SECRET_KEY` | API y worker | Clave secreta únicamente del nuevo proyecto; privada |
| `SHIPPING_MODE` / `PAYMENTS_MODE` | API y worker | `mock` / `mock` |
| `MATEBREAK_STAGING_PERSIST_MOCK` | API y worker | `1` |
| `MOCK_PAYMENT_RESULT` | API | `approved`, `rejected` o `pending`; cambiar manualmente para cada escenario |
| `MOCK_ORIGIN_POSTAL_CODE` | API | `7000`, ficticio para simulación |
| `STAGING_BACKEND_ORIGIN` | Build frontend | Origen HTTPS de API Render staging, sin barra final; no secreto |
| `PORT` | API | Lo provee Render; no fijarlo manualmente |

No configurar `MP_*`, `MERCADOPAGO_*`, credenciales MiCorreo, `SUPABASE_ACCESS_TOKEN`, `DATABASE_URL` ni `POSTGRES_URL` en runtime staging: se rechazan. Tampoco activar flags localhost. La clave secreta no va en Vercel, dist, commits, capturas, logs ni chat. Copiar las claves directamente entre los dashboards staging y Render. Usar proyectos/grupos de variables diferentes de producción; las validaciones no pueden determinar mágicamente el origen de cada clave, por lo que verificar su proyecto es responsabilidad del operador.

## Preparación manual del responsable

Todavía no se contrataron servicios ni se crearon proyectos. El responsable debe crear o seleccionar cuentas de Vercel, Render y Supabase, aceptar costos y crear proyectos exclusivamente staging. Compartir sólo referencias, URLs y nombres, nunca secretos. Aprobar por separado la creación de servicios y su primer despliegue: importar un Blueprint puede crear y desplegar servicios aunque los despliegues automáticos futuros estén apagados.

Definir un origen estable, por ejemplo `https://<frontend-staging>.vercel.app`, y la URL Render `https://<api-staging>.onrender.com`. No usar dominios de la tienda real. Evitar previews aleatorios como origen de Auth; si se utiliza un alias staging, mantenerlo estable. Activar protección de acceso Vercel si el plan lo permite y se desea restringir evaluadores; `noindex` evita indexación solicitada, no proporciona autenticación.

## Supabase staging

1. Crear un proyecto vacío independiente y verificar nombre, referencia y organización. No clonar producción ni conectar su base; no exportar usuarios, pedidos, ventas, sesiones, archivos personales o credenciales. Confirmar Deploy to production desactivado.
2. Seleccionar la versión/región del proyecto y revisar compatibilidad de los 26 SQL. CLI fijado en `2.118.0`: consultar `node node_modules/supabase/dist/supabase.js db push --help`. No actualizar CLI durante la publicación sin repetir pruebas. El rehearsal local aprobado no asegura que un proyecto gestionado nuevo permita todos los DDL/roles históricos.
3. Tras autorización específica del proyecto y commit, el operador puede inspeccionar el plan con `node node_modules/supabase/dist/supabase.js db push --project-ref <STAGING_REF> --dry-run --skip-vault`. Usar autenticación de administración staging en la sesión del operador, fuera de runtime/repositorio; no introducir passwords en argumentos o chat. Revisar las 26 migraciones en orden y la referencia mostrada. No usar `--include-all`, `--include-seed` ni configuración enlazada ambigua.
4. Sólo después de revisar y aprobar ese plan, ejecutar `node node_modules/supabase/dist/supabase.js db push --project-ref <STAGING_REF> --skip-vault`. No ejecutar `migration repair` remoto ni `db push` productivo. Si hay errores de privilegios o historial, detenerse y registrar un mensaje sanitizado; no elevar roles ni intentar reparar automáticamente. El primer despliegue queda bloqueado hasta resolver y aprobar esa diferencia.
5. Verificar Storage `product-images` y sus policies según el baseline/configuración local; crear únicamente recursos staging faltantes mediante revisión manual. El SQL puede incorporar metadatos históricos del catálogo público; los fixtures los ocultan y reemplazan la publicación visible por un artículo sintético. No contiene una copia de clientes o pedidos.
6. Antes de registrar usuarios de prueba, abrir el SQL editor del proyecto staging comprobado y ejecutar `SET matebreak.environment = 'staging';` seguido del contenido exacto de `deploy/staging/fixtures.sql` en la misma sesión/ejecución. El archivo exige la marca y una base sin cuentas, pedidos o ventas. No eliminar datos existentes para saltar esa protección. Publica un único mate sintético, precio 10000 ARS y stock 100 de componentes/caja; no realiza ventas reales. Revisar el catálogo después.
7. Auth: Site URL igual a `APP_ORIGIN`; callback permitido exacto `APP_ORIGIN/auth/callback`. Revisar el flujo actual de confirmación. Para cuentas ficticias `.invalid`, desactivar confirmación de correo sólo en este proyecto de pruebas, o usar buzones exclusivos de prueba y SMTP staging si se va a probar confirmación real. Nunca reutilizar contraseñas/cuentas de producción.
8. Registrar una cuenta cliente y una cuenta administradora ficticias. El operador debe verificar sus UUID en **Auth staging** y habilitar sólo la cuenta administradora en `private.equipo_inventario(usuario_id, activo)`; revisar el SQL y permisos de `20260908093541_inventory_admin.sql` y `20260909000858_account_admin_roles.sql`. No copiar UUID ni roles productivos. Comprobar que el cliente recibe denegación en `/interno`.

## Render API y worker

Para esta primera iteración se selecciona **Free**, nombre matebreak-api-staging y región Oregon; los valores vigentes están en `docs/staging-first-deploy.md`. No crear workers ni cron ahora. Los pasos del worker pago siguientes son sólo una referencia futura sujeta a nueva autorización. Free duerme y no mantiene el job de expiración activo durante la suspensión.

1. Autorizar el commit revisado y publicar una rama staging separada en GitHub cuando corresponda. Los templates apuntan a `codex/staging-preparation`; actualizar explícitamente si la rama cambia.
2. Revisar `deploy/staging/render.yaml`, conectar sólo el repositorio/rama aprobados y mantener `autoDeployTrigger: off`. El responsable crea el servicio; la importación inicial requiere aprobación porque puede lanzar un build.
3. Configurar todas las variables de la tabla antes de lanzar la API. `npm ci` instala dependencias y `npm start` escucha en el `PORT` de Render. No montar `.env` de la tienda real.
4. Verificar HTTPS y `GET /healthz` = 200 `{ "status": "ok" }`. Es liveness de Express; no acredita conectividad SQL/Auth. Verificar catálogo sintético y login para readiness funcional.
5. Si se prueba importación logística asíncrona, crear el worker separado con `deploy/staging/render-worker.yaml`, mismas variables staging y start `npm run start:staging:worker`. Nunca arrancar el worker con una configuración de producción. Sin worker los trabajos pueden permanecer pendientes; no declarar validada la importación.
6. Logs: conservar eventos sanitizados de la API y estados del worker. No agregar bodies, emails, domicilios, tokens, Authorization, cookies ni claves. Ante errores recopilar identificador/estado y hora; no pegar dumps de pedidos o env completos. Ajustar retención y acceso en Render. No conectar observabilidad productiva.

## Vercel frontend

La configuración actual y los pasos exactos están en `docs/staging-first-deploy.md`. Root Directory ./, framework Other, Node 22, build npm run build:staging, output dist, install npm ci, rama codex/staging-preparation. El root vercel.json incluye git.deploymentEnabled false. Falta la URL Render real: el primer build/despliegue permanece bloqueado y no hay destinos .invalid. Antes de publicar la configuración completa, preparar y revisar los proxies API/Auth/interno/healthz con configure:staging:frontend. No finalizar la creación/Deploy sin autorización expresa.

La navegación usa el origen Vercel estable; las cookies Secure/HttpOnly/host-only y Origin exacto se conservan. Las pruebas HTTPS externas todavía están pendientes.

## Publicación aprobada y verificación

Secuencia: revisión/CI del commit → autorización del proyecto Supabase y plan SQL → migraciones staging → fixtures → configuración Auth → API → worker → build/frontend → prueba externa. Cada acción externa pendiente requiere aprobación del responsable. Registrar commit desplegado, versiones, referencias, URLs, hora, plan SQL y resultados sanitizados en la evidencia de publicación. Mantener producción aislada durante toda la secuencia.

| Prueba externa | Ejecución | Criterio de aceptación |
| --- | --- | --- |
| Registro/login | Cliente ficticio nuevo; logout y login; usuario inválido | Sesión persiste al recargar; errores claros; cookies seguras; sin datos productivos |
| Catálogo | `/tienda`, detalle, filtros y recarga | Sólo fixture visible/comprable; precio esperado; ningún catálogo privado expuesto |
| Carrito | Añadir, variar cantidad, quitar, refrescar | Totales correctos; cookie segura; sesiones distintas aisladas |
| Checkout | Cliente autenticado con domicilio/identidad ficticios | Pedido SQL e idempotencia correctos; doble clic no duplica; login requerido |
| Reserva | Dos clientes y última unidad en fixture controlado | No sobreventa; expiración/cancelación libera stock; aprobado confirma consumo |
| Pago aprobado | API `MOCK_PAYMENT_RESULT=approved`, reinicio manual aprobado | Estado pagado y stock consistente; sin llamadas Mercado Pago |
| Pago rechazado | `rejected`, nueva idempotencia | Rechazo visible, reserva liberada, reintento controlado |
| Pago pending | `pending`, nueva idempotencia | Pendiente visible, sin consumo final anticipado; vencimiento libera reserva |
| Logística | Cotizar correo mock, pedido pagado, worker mock activo | Cotización/snapshot sintéticos; job pasa a importado; ninguna llamada MiCorreo |
| Administración | Admin ficticio y cliente sin rol | Admin ve/gestiona pruebas; cliente denegado; historial y recuperación revisables |
| Errores | Origen ajeno, cantidad inválida, red interrumpida, backend caído y 429 | Respuesta segura, ningún stack/credencial; reintento idempotente; stock coherente |
| Recuperación logística | Job en revisión mediante fixture de fallo controlado y acción admin | Recuperación auditada; no duplicar importación; secretos ausentes en logs |
| Dispositivos | Chrome/Edge computadora; Android Chrome e iPhone Safari si disponibles | Catálogo, carrito, formularios, login/redirect y resultado utilizables por HTTPS |

Cambiar resultados mock implica configuración/reinicio manual, nunca un endpoint público para cambiar pagos. Los fallos logísticos controlados deben diseñarse en staging y aprobarse antes de escribir sus fixtures; el worker actual simula importación satisfactoria. Los tests Node ya cubren recuperación con dobles de fallo; la recuperación desde la UI externa aún está pendiente. Probar capacidad/cookies/429 desde varios clientes antes de declarar listo. Guardar capturas sin credenciales y marcar cada caso PASS/FAIL/PENDIENTE; no afirmar aprobación externa sólo con tests locales.

## Rollback

Si falla el primer despliegue: detener worker, revertir frontend y API al último commit/configuración staging aprobados o retirar el acceso de pruebas. Mantener auto deploy apagado. Revertir configuración de ambos componentes de forma coherente. No dirigir staging hacia producción como alternativa.

Las migraciones no tienen rollback automático: revertir un commit no revierte PostgreSQL. Antes de futuras migraciones staging, decidir snapshot/respaldo y plan de recuperación específico. Para este primer proyecto vacío, si el baseline falla, detenerse; recrear un proyecto staging desechable sólo con autorización, sin `repair` remoto ni borrados automáticos. Rotar exclusivamente claves staging si se filtran. No borrar cuentas, datos o servicios productivos. No reutilizar fixtures de inicialización después de crear usuarios/pedidos.

## Costos estimados (USD/mes)

Precios consultados el 1/10/2026; no incluyen impuestos, exceso de uso, dominio, SMTP ni protección de acceso adicional. No se realizó contratación.

| Componente | Estimación inicial |
| --- | --- |
| Render API Starter | 7 |
| Render worker Starter opcional | 7 |
| Vercel Pro, un miembro | 20 + uso adicional |
| Supabase Pro, organización independiente con un Micro cubierto por crédito | 25 + uso adicional |
| Total de referencia con worker | **59** |
| Total sin worker (importación asíncrona no validada) | **52** |

Supabase Free puede servir para pruebas limitadas, sujeto a cuotas/pausa; Vercel Hobby es 0 sólo si el uso cumple sus condiciones. No presumir elegibilidad Hobby para un proyecto comercial. Una prueba elegible con ambos free y dos servicios Render cuesta aproximadamente 14/mes. Un proyecto Supabase adicional en una organización Pro ya existente puede sumar compute (Micro ~10/mes), no necesariamente otra suscripción de 25: revisar facturación y mantener aislamiento de proyecto/secretos.

Railway Hobby tiene mínimo 5/mes incluido en uso; Pro mínimo 20. A las tarifas publicadas, un servicio con 0,5 GB RAM y 0,1 vCPU medios durante 30 días ronda 7/mes antes de egress/otros cargos; API+worker rondarían 14 de uso, sujetos al mínimo del plan. Es una estimación de consumo, no una tarifa fija ni una medición de MateBreak.

Fuentes oficiales: [Render precios](https://render.com/pricing), [Render Blueprint](https://render.com/docs/blueprint-spec), [Railway precios](https://railway.com/pricing), [Vercel precios](https://vercel.com/pricing), [Vercel rewrites](https://vercel.com/docs/routing/rewrites), [Vercel control Git](https://vercel.com/docs/project-configuration/git-configuration), [Vercel CLI deploy](https://vercel.com/docs/cli/deploy), [Supabase precios](https://supabase.com/pricing), [Supabase migraciones](https://supabase.com/docs/guides/local-development/database-migrations), [Supabase redirects Auth](https://supabase.com/docs/guides/auth/redirect-urls).

## Evidencia y pendientes

Validación ejecutada: Node **162/162**; integración completa local PASS (18/18 SQL históricos, 20/20 concurrencia, 9/9 ciclo minorista, Auth/RLS/Storage, logística y recuperación administrativa); fixtures staging PASS con transacción revertida; build HTTPS y rechazos de orígenes inválidos PASS; sintaxis de 116 archivos PASS; arquitectura sin ciclos/imports/assets faltantes; npm audit con 0 vulnerabilidades; 26/26 hashes idénticos. Supabase local quedó apagado. El rehearsal baseline previamente aprobado se conserva sin alteración; no se volvió a adoptar historial remoto.

Las evidencias locales se guardan en `docs/staging-evidence/`: consolidación/hashes, suite Node, suite completa, fixtures, auditoría de dependencias y arquitectura. La suite completa se ejecutó sobre el código de esta preparación; una prueba Node adicional de checkout persistente se agregó y ejecutó después. No se ejecutaron pruebas externas, no hay CI remoto de esta nueva rama y no se modificó `.env.example` del checkout principal.

Pendiente del responsable: autorizar #2 después de su nueva revisión; revisar/publicar la preparación; crear cuentas/proyectos staging; aportar referencias y URLs sin secretos; aprobar plan SQL y primer deploy; asignar claves staging directamente en Render; ejecutar la matriz externa. Mantener Deploy to production apagado.

Antes de producción: revisión independiente del baseline/privilegios cloud y políticas RLS; plan de migración y backups; pagos/webhooks reales revisados; contrato/perfiles/parcelas MiCorreo verificados; SMTP y entregabilidad; dominio/cookies; limiter compartido y proxies; monitoreo/alertas; requisitos de datos y roles; pruebas de carga y recuperación. Esta preparación no habilita Mercado Pago, MiCorreo, main ni Supabase productivo.

Verificación posterior a #3: 159/159 tests en la rama consolidada, 162/162 en staging, auditoría del baseline/catálogo histórico aprobada, 0 vulnerabilidades productivas, build HTTPS/sintaxis aprobados. Los 26 hashes originales permanecen intactos en staging y los 26 blobs Git del consolidado son idénticos a los aprobados. El checkout Windows de la rama consolidada introduce CRLF: se verificó también igualdad tras normalizar finales de línea; el detalle está en la evidencia, sin modificar los SQL. No se repitió la suite completa SQL porque el árbol consolidado es idéntico al ya validado; se conserva la evidencia anterior. Main sigue en `15c9d64`. Esta nueva revisión y sus logs complementan la evidencia histórica, sin reemplazarla.
