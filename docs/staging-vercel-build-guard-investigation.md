# Investigación del primer build Vercel Staging

Destino: copplex1/matebreak-staging, prj_CrDsy4AToxUT27bCsEbuaDmAceJh.
Intento examinado: dpl_E2VQcyL1UXy8Lz6f43EvE6ZF42h5, estado ERROR.
Source aprobado: 62fd54b69f36bca2c421771c5a2d40909a0dddc6.
No se ejecutó un segundo deploy durante esta investigación.

## Evidencia confirmada

- Cloud terminó npm ci y ejecutó npm run build con Node 22.23.2.
- La excepción se originó en isDeepStrictEqual(config, expected) de
  assertStagingVercelReady. La validación previa del origen no lanzó una excepción.
- GET del árbol de archivos y de los tres archivos públicos del intento confirma
  vercel.json, scripts/staging-config.mjs y scripts/build-staging.mjs idénticos
  al source aprobado, normalizando exclusivamente CRLF/LF.
- El build npm directo pasa también con Node 22.23.2.
- Una copia aislada del frontend, con el mismo vercel.json, los tres scripts
  y settings públicos, pasa vercel build --prod con Vercel CLI 62.0.0 y
  Node 22.23.2 dentro de un contenedor Linux local. No contiene credenciales,
  no usa vercel pull y no genera un deployment.
- El runner local de Windows encontró spawn cmd.exe ENOENT. Esa ejecución no
  se presenta como reproducción del fallo Cloud; la verificación Linux sí
  alcanzó y aprobó la guarda y el build estático.
- La lectura del entorno del deployment fallido fue rechazada por la API:
  Deployment is in ERROR state, expected INITIALIZING (400). No se obtuvieron,
  imprimieron ni guardaron valores de ese entorno.

## Límite del diagnóstico

El campo exacto que difería durante el build Cloud no está registrado en el log.
La copia original subida no es una captura del filesystem en el momento de la
excepción. Tampoco permite verificar el valor efectivo del origen en ese momento.
No se ha demostrado que Vercel haya normalizado o reescrito un campo particular.
No atribuir el fallo a git, framework, version, caché o Node sin esa evidencia.

La causa comprobada del rechazo es una discrepancia entre los dos objetos durante
esa ejecución; la causa de esa discrepancia sigue pendiente. La falta de detalle
del mensaje original impide distinguir entre un cambio del JSON y un origen
efectivo diferente. No se considera resuelto el primer build remoto.

## Corrección local del diagnóstico

Se conserva exactamente el isDeepStrictEqual original como condición bloqueante.
Cuando falla, el mensaje enumera rutas de campos esperados que difieren, campos
faltantes y presencia de claves inesperadas. No imprime valores, nombres de
claves inesperadas, secretos ni variables de entorno. Se limita a 32 diferencias.

No se aceptan campos adicionales ni se omite git, framework, headers, rewrites,
comandos o directorio de salida. No se cambian vercel.json, package.json,
.vercelignore, .vercel/project.json, el header ni ninguna configuración remota.
La aceptación y el rechazo de configuraciones conservan las mismas condiciones.

Las pruebas cubren la configuración válida tras un round-trip JSON y el rechazo
de cambios de Git, comandos, output, framework, rutas externas/internas, headers,
rutas añadidas/eliminadas y metadatos no aprobados. Otra prueba verifica que los
mensajes no revelan un valor privado sintético ni un nombre de clave inesperada.

## Siguiente paso, con autorización separada

Revisar el diff y el commit local, ejecutar la suite y el build finales, y verificar
el enlace, HEAD limpio, exclusiones y Git desconectado antes de cualquier deploy.
Una nueva ejecución Cloud requerirá autorización expresa para el nuevo commit.
Si vuelve a fallar, detenerse: sus rutas de diferencias permitirán precisar la
discrepancia sin relajar validaciones a ciegas. No hacer retries automáticos.
Las capturas originales y logs completos permanecen fuera del repositorio.

## Referencias de lectura

- https://vercel.com/copplex1/matebreak-staging/E2VQcyL1UXy8Lz6f43EvE6ZF42h5
- https://github.com/vercel/sdk/blob/main/docs/sdks/deployments/README.md
- https://vercel.com/docs/cli/build

## Validación local del cambio

npm ci aprobado con Node 22.23.3; npm test 169/169, cero fallos/omitidos;
npm run build aprobado. La configuración, el header y las exclusiones de
publicación conservan el estado aprobado. El resultado remoto continúa ERROR.

El diagnóstico nuevo también pasó vercel build --prod en la copia aislada
Linux con CLI 62.0.0 y Node 22.23.2. El listado remoto conserva únicamente
el primer intento fallido: no hubo un segundo deployment.

## Investigación posterior del segundo intento (2026-10-01)

Las secciones anteriores describen la investigación previa, en d60a0cf. Después
se autorizó y ejecutó un segundo intento, dpl_BWiVGg4E9RgXn7WmPZG6EfkYRCjA,
que terminó ERROR. Su diagnóstico fue `differing paths: $ (unexpected keys)`.
Esta investigación posterior no ejecuta un tercer deploy ni modifica servicios.

### Comparación de las tres representaciones

| Representación | Evidencia |
| --- | --- |
| JSON local de d60a0cf | Siete claves raíz: git, installCommand, buildCommand, outputDirectory, framework, rewrites y headers. |
| JSON subido en el segundo intento | La API de archivos devuelve las mismas siete claves y contenido idéntico al local, normalizando exclusivamente CRLF/LF. |
| Objeto leído durante npm run build en Cloud | El error sólo identifica claves raíz adicionales. No capturó sus nombres ni su contenido; esa representación no está disponible en la API de archivos de origen. |

El diagnóstico existente compara todas las claves esperadas y sus descendientes.
Que únicamente aparezca `$ (unexpected keys)` indica que esos campos coinciden y
que existen claves adicionales en la raíz. No identifica cuáles, cuántas ni
quién las añadió. No demuestra que sean metadatos inocuos. La causa de su
incorporación permanece sin confirmar; se necesita el diagnóstico seguro de
esa ejecución, o una captura equivalente proporcionada por Vercel.

### Selección de configuración y combinación del comando

Se revisó el comando del segundo intento: `deploy --prod --scope copplex1`
con el build-env público del backend autorizado, sin `--local-config/-A`,
sin `--prebuilt` ni conexión Git. No se volvió a ejecutar ese comando.

La CLI local 62.1.0 selecciona vercel.json de la raíz por defecto. Su lector
earlyGetConfig admite una ruta alternativa sólo con --local-config. El compilador
compileVercelConfig no genera una configuración alternativa cuando existe el
JSON raíz y no hay vercel.ts/vercel.toml. El script build-staging.mjs lee
explícitamente ../vercel.json; no selecciona archivos por glob ni usa el generado.

La CLI sí combina campos al preparar la petición de creación del deployment:
Now.create parte de nowConfig y añade campos de transporte como projectSettings,
meta, target, source, env y build. Los overrides de comandos/salida proceden del
JSON, y engines.node del package.json. Esto describe el objeto enviado a la API;
no demuestra que esos campos se escriban en vercel.json durante el build Cloud.
Tampoco debe confundirse el campo config de la respuesta del deployment
(configuración de infraestructura) con el JSON que lee nuestra guarda.

Archivos examinados de la distribución oficial de CLI 62.1.0:
index.js (earlyGetConfig), commands/deploy/index.js,
chunks/chunk-35QWU4NB.js (Now.create), chunks/chunk-ZOIPWLUF.js
(compileVercelConfig) y chunks/chunk-Z26EOSNI.js (buildVercelConfigSchema).
La ejecución Cloud usó CLI 62.0.0; no se afirma que el código interno de Cloud
sea idéntico al de la CLI local examinada. La reproducción Linux previamente
documentada con 62.0.0 pasó y no produjo estas claves adicionales.

### Archivo generado y configuración del Dashboard

vercel.staging.generated.json está ignorado por Git pero no por .vercelignore.
Se confirmó su inclusión en los archivos subidos del segundo intento y su
igualdad con la copia local. Contiene el backend placeholder del preparador,
buildCommand npm run build:staging y no tiene installCommand. Por tanto no es
equivalente al JSON aprobado. No hay evidencia de que se haya seleccionado o
mezclado: sus rutas también habrían producido diferencias específicas que el
segundo intento no reportó. No se modificó ni se aceptó este archivo como fuente.
Antes de un futuro paquete conviene excluir ese artefacto no utilizado; este
commit diagnóstico conserva .vercelignore y todos los archivos de hosting.

La consulta de sólo lectura confirmó nuevamente el proyecto y su equipo:
matebreak-staging, prj_CrDsy4AToxUT27bCsEbuaDmAceJh,
accountId team_lIiIUZEuCy5NAdctFIrl8mt8, con Git desconectado.

| Campo | Proyecto remoto persistido | Settings del segundo deployment |
| --- | --- | --- |
| nodeVersion | 24.x | 22.x |
| buildCommand | null | npm run build |
| installCommand | null | npm ci |
| outputDirectory | null | dist |
| framework | null | null |

Los settings resueltos muestran que se aplicaron los overrides aprobados. La
diferencia con los defaults del Dashboard existe, pero no demuestra la causa de
las claves adicionales del archivo. No se actualizaron settings remotos.

### Ampliación segura del diagnóstico

El mensaje de rechazo ahora añade:

- Claves raíz esperadas, ordenadas.
- Claves efectivamente presentes cuyos nombres están en una lista estática segura.
- Nombres conocidos adicionales y cantidad de nombres desconocidos ocultos.

La lista sirve exclusivamente para imprimir nombres públicos de configuración o
de la petición de la CLI; no autoriza ninguna propiedad. Se conservan exactamente
isDeepStrictEqual y el rechazo de toda clave adicional, conocida o desconocida.
No se imprimen valores, nombres de variables de entorno, contenido de meta/env,
claves anidadas inesperadas, nombres arbitrarios ni un dump del objeto efectivo.
La salida está acotada por la lista finita de nombres y 32 rutas de diferencias.

Por ejemplo, una clave version adicional seguiría bloqueando el build y ahora
reportaría `additional known=["version"]`. Una clave arbitraria sólo incrementa
`undisclosed unexpected keys`. Ningún nombre adicional real de Cloud se conoce
todavía: estos ejemplos son pruebas sintéticas, no hallazgos del intento remoto.

Propiedades conocidas no implican igual comportamiento: $schema sirve para
validación/autocompletado del editor; regions, routes, builds, env o services
pueden afectar el despliegue. Los campos de transporte describen una petición,
no una autorización para incorporarlos al JSON. Cualquier futura aparición exige
verificar su origen y significado antes de considerar un cambio de la guarda.

### Validación y estado de entrega

npm ci, npm test (173/173, cero fallos/omitidos) y npm run build aprobados con
Node 22.23.3 y el origen público autorizado de Render. Las cuatro pruebas nuevas
cubren nombres conocidos rechazados, privacidad de nombres/valores arbitrarios,
metadatos falsy/raíces inválidas y la lectura exclusiva del JSON raíz frente al
archivo generado. Este último caso ejecuta el build real sobre archivos
sintéticos en un directorio temporal, sin credenciales ni acceso a servicios.

Sólo se modifican scripts/staging-config.mjs, tests/staging-hosting.test.mjs
y este informe. Los logs completos y el diff de revisión quedan fuera del
repositorio. El header aprobado, los rewrites, las exclusiones y el enlace local
se conservan. No hay tercer deployment ni publicación de este commit.

Referencias oficiales para selección y precedencia:

- https://vercel.com/docs/cli/global-options#local-config
- https://vercel.com/docs/project-configuration
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/copplex1/matebreak-staging/BWiVGg4E9RgXn7WmPZG6EfkYRCjA
