# Investigación de name/version en Vercel Staging

Base examinada: c112e724926c655db3ac85fde807efedcd3de6d9.
Tercer intento: dpl_A62h5TmSrwqAWgFpwBy2HPFyi1rP, ERROR.
Destino: copplex1/matebreak-staging, prj_CrDsy4AToxUT27bCsEbuaDmAceJh.
No se ejecuta un cuarto deployment, push ni modificación de settings remotos.

## Evidencia y límite de la conclusión

El árbol de archivos del tercer intento y la lectura del vercel.json subido
confirman que contiene exactamente las siete claves aprobadas y coincide con
el archivo local, normalizando CRLF/LF. Los scripts build-staging.mjs y
staging-config.mjs subidos también coinciden con c112e72. package.json no tiene
propiedades name ni version; no hay hooks de instalación/build que las escriban.

La carga examinada es JSON.parse(readFileSync(..., 'utf8')), sin reviver, merge,
spread ni procesamiento posterior antes de la guarda. staging-config.mjs
compara y diagnostica el objeto sin mutarlo. Bajo esa carga nativa, las claves
adicionales proceden del contenido disponible al leer el archivo, no de una
normalización de nuestro código. El log identifica name y version y ninguna
otra diferencia. La API de archivos devuelve el origen subido, no una captura
del filesystem del runner durante la excepción. No disponemos de esa captura
ni de una traza que identifique al proceso que reescribió el archivo.

Cloud ejecutó CLI 62.0.0 y Node 22.23.2. La CLI local que envió el deployment
era 62.1.0. No se confunden ambas versiones ni se atribuye la modificación a
una de ellas sin una reproducción o traza equivalente.

## Código exacto y reproducción sin despliegues

Se instaló la distribución oficial vercel@62.0.0 en un directorio de evidencia
local, fuera del repositorio. Se examinó commands/build/index.js,
commands/deploy/index.js y chunks/chunk-2A2GVGNS.js de esa distribución.

- deploy toma el nombre del proyecto para createArgs.name.
- El cliente de deployment fija resolvedOptions.version a la versión de
  plataforma que soporta, antes de enviar la petición.
- Esto modifica el objeto de transporte, no demuestra una escritura del
  vercel.json físico durante el build Cloud.

Una ejecución de ese SDK contra un servidor HTTP simulado exclusivamente en
127.0.0.1 confirmó ambos campos en la petición y confirmó por SHA-256 que el
archivo físico quedó intacto. Se usó una credencial ficticia sólo contra ese
servidor local. La respuesta simulada interrumpe el flujo: no crea un deployment
ni realiza llamadas a la API de Vercel. No se imprimieron cuerpos ni valores.

También se ejecutó vercel build --prod en una copia aislada del paquete, dentro
de Linux con CLI 62.0.0 y Node 22.23.2, CI=1 y VERCEL=1. Sólo contiene la
configuración pública del proyecto y el origen público del backend. No usa
vercel pull, login ni secretos. El build terminó correctamente y las claves
del JSON siguieron siendo las siete originales antes y después. Se repitió
con el diagnóstico local ampliado; esta ejecución tampoco es un deployment.

Por tanto se reprodujo la incorporación de campos a la petición, pero no su
incorporación al archivo físico. No se ha identificado el componente Cloud
responsable ni comprobado los valores que escribió en ese archivo.

## Decisión: sin excepciones ni normalización

La documentación oficial clasifica name/version como propiedades heredadas:
name influye en la identificación del deployment/proyecto y version selecciona
la versión de plataforma. Su existencia documentada no las convierte en
metadatos inocuos. No hay evidencia suficiente para descartarlas silenciosamente,
ni para aceptar tipos/valores arbitrarios, incluso si los siete campos coinciden.

No se incorpora una normalización. isDeepStrictEqual permanece intacto y rechaza
name, version, cualquier tercera clave y modificaciones de los siete campos
protegidos. Las validaciones de origen, rewrites, Git, headers, build y output
conservan sus condiciones de aceptación.

## Mejora local del diagnóstico

build-staging.mjs captura las claves inmediatamente después de parsear el
archivo físico. Cuando la guarda rechaza el objeto, añade una comparación entre
esa captura y las claves que evalúa. Sólo imprime nombres estáticos conocidos,
cuenta nombres arbitrarios ocultos y comunica si ambos conjuntos coinciden.
No imprime texto fuente, valores, credenciales ni nombres de variables de entorno.
No cambia el JSON, el paquete, el destino ni ninguna condición de la guarda.

La captura es una lectura del JSON en la frontera de carga, no una atribución
del origen de la modificación. Si un futuro log muestra igualdad, confirma que
la guarda recibió las mismas claves que se parsearon; si no, identifica una
modificación posterior del conjunto de claves.

## Validación

npm ci y npm run build aprobados con Node 22.23.3; npm test 175/175, sin fallos
ni pruebas omitidas. Las pruebas nuevas comparan capturas iguales/diferentes,
ocultan nombres/valores privados sintéticos y rechazan cambios de los siete
campos incluso acompañados de name/version. La prueba del entrypoint real
comprueba que name/version y una tercera propiedad privada se rechazan y que
el diagnóstico no revela sus valores o el nombre privado.

La inspección offline del paquete conserva la selección exclusiva de vercel.json
y los 143 archivos regulares necesarios. Las exclusiones de credenciales,
backend, SQL, evidencias, README, herramienta de extracción y JSON generado
se mantienen. Los logs, fuentes de la CLI y copias completas quedan locales.

## Alternativa técnica propuesta

Generar y revisar localmente el Build Output API con vercel build --prod y
desplegar posteriormente ese artefacto mediante --prebuilt. La guarda estricta
se ejecuta sobre el JSON aprobado durante el build local. El runner Cloud no
vuelve a ejecutar npm run build sobre un archivo transformado. No implica
aceptar propiedades adicionales ni ocultar el fallo del tercer intento.

La copia aislada demuestra que este método puede producir el artefacto. Antes
de publicar se revisó ese artefacto: 136 archivos estáticos, sin funciones de
backend, con las cuatro rutas proxy hacia el único origen aprobado y los
headers noindex/no-store. No se detectaron rutas privadas ni patrones de
credenciales privadas en el output. Esta auditoría no constituye publicación.
Antes
de publicar deben confirmarse el HEAD final, hashes del artefacto, rutas y
headers compilados, contenido exclusivamente estático y ausencia de secretos,
además del ID/equipo y enlace. Su uso y publicación requieren autorización
expresa separada; no se sustituye automáticamente el método de despliegue.

## Referencias oficiales

- https://vercel.com/docs/project-configuration/vercel-json#name
- https://vercel.com/docs/project-configuration/vercel-json#version
- https://vercel.com/docs/cli/build
- https://registry.npmjs.org/vercel/-/vercel-62.0.0.tgz
- https://vercel.com/copplex1/matebreak-staging/A62h5TmSrwqAWgFpwBy2HPFyi1rP
