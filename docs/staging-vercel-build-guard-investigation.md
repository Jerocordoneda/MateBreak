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
