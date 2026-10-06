# Diagnóstico temporal #1008 — plan previo a deploy

Alcance exclusivo: Staging, pedido 1008 / UUID `1afd463b-2465-4a57-b702-62777682c8af`, Payment `182650336328`, Preference `3741487042-34d265fc-3d18-46c0-a0a2-200a8acceed0`, vendedor `3741487042`, aplicación `4827641840215059`.

No se despliega ni habilita con este documento. G/H permanecen históricos. No se está corrigiendo la firma ni autorizando un reintento.

## Elección del mecanismo

Render MCP reconfirmó `matebreak-api-staging`, servicio `srv-davbsjad0e5s73fcoc30`, una instancia, runtime Node, compute **free**, auto-deploy apagado. El `sshAddress` presente en sus metadatos no acredita acceso SSH: [Render limita shell/SSH a servicios compatibles de pago](https://render.com/docs/ssh) y [Free excluye jobs puntuales](https://render.com/docs/free). Las herramientas conectadas tampoco ofrecen exec. No se cambia de plan ni se crea un servicio.

Se prepara B: `GET https://matebreak-api-staging.onrender.com/_staging/diagnostics/mp-1008`, protegido y temporal. No pasa por Vercel, no modifica frontend, no utiliza cookies de clientes. Una autenticación administrativa habitual requeriría nuevos acoplamientos de sesión/DB; se elige un bearer diagnóstico independiente, de 256 bits, creado y custodiado por el titular en Render. **MP_ACCESS_TOKEN permanece únicamente en el runtime**; nunca es el bearer de esta ruta.

## Controles y superficie

- APP_ENV staging (config.staging), NODE_ENV no production (config.production=false), envío mock, pagos real, contrato MP TEST explícito, persisted mock apagado, collector exacto y expected live mode false.
- Flag dedicado apagado por defecto; clave independiente válida y fecha UTC obligatoria. Fecha futura de hasta dos horas al arrancar; cierre automático al llegar a ella. No existe verified=true remoto configurable.
- Ruta exacta, GET exclusivamente: no query, subpath, body ni IDs de cliente. POST/HEAD rechazados. Si está deshabilitada o vencida responde 404. Es una ruta reservada que no cae en middlewares comerciales.
- Registrada antes de sesión, parser API, cookies, limiter SQL y rutas comerciales. No recibe admin/DB/RPC. Único import de su módulo: node:crypto. Reutiliza verifyTestIdentity mediante una función sin entregar el resto del adaptador.
- Sólo GET a hosts y paths fijos. Identidad autenticada primero; si no confirma vendedor TEST, no consulta recursos. Redirects, timeout, HTTP inesperado, contenido inválido y errores bloquean sin mostrar raw.
- Dos ejecuciones por proceso, consumidas antes de esperar y también si falla upstream; máximo 20 solicitudes por diez minutos antes de auth. Sin persistencia ni caché de resultados. No-store, sin CORS ni Set-Cookie. No logs adicionales.
- Respuesta whitelist y checks; IDs serializados como strings para preservar precisión. Payment.live_mode se reporta, incluso true; eso no aprueba ni concilia un pago. Expected permanece false.
- status_detail sólo se devuelve para estados explícitamente conocidos; otro valor queda null. notification_url sólo se devuelve si coincide exactamente con uno de los dos endpoints Staging conocidos, sin query ni secretos; otra URL queda null/UNVERIFIED. No se serializan items ni estructuras personales.
- merchant_order.id se proyecta únicamente desde Payment.order.id si order.type=mercadopago; no se inventa un recurso ni se consulta merchant order. No se devuelven application_id no verificados documentalmente del Payment; la correlación de aplicación usa Preference.client_id.

## Threat model y límites

Atacante anónimo: sólo obtiene rechazo genérico; no puede elegir recursos ni generar GET autenticados. Atacante con clave diagnóstica: puede consultar únicamente estos recursos y campos, dentro de ventana y cuota; no puede escribir. Un titular autorizado puede recibir mismatch de live_mode y otros checks, que son evidencia, no una autorización para saltar guards.

Los límites son en memoria: restart/redeploy reinicia cuotas. La fecha absoluta sigue cerrando la ventana; evitar reinicios mientras esté habilitado. Una ráfaga anónima puede consumir el cupo de entrada y bloquear diagnóstico diez minutos: riesgo de disponibilidad aceptado para priorizar cierre seguro. No hay durabilidad del rate limiter porque escribir SQL contradiría el aislamiento requerido.

La aplicación y la infraestructura conservan privilegios y tareas existentes; el módulo diagnóstico no puede invocarlos. Un deploy/restart puede reiniciar procesos habituales y la expiración normal puede alterar reservas mientras se investiga. No afirmar que todo Cloud permanece inmóvil ni atribuir esas tareas al GET diagnóstico. Si #1008 vence, este mecanismo sigue siendo lectura; no repone stock ni confirma pagos.

La clave temporal es distinta del token MP: para autenticar la consulta deberá ser conocida exclusivamente por el titular/caller autorizado. Se genera y almacena en Render, sin incluirla en Git, informes, Codex, archivos de resultados o logs. El titular realiza la consulta desde un cliente HTTPS confiable sin logging de headers y comparte sólo el JSON minimizado. No usar query string, cURL con clave literal, HAR ni capturas de Authorization. No crear un intermediario público que conozca esa clave.

## Activación propuesta, sólo tras autorización

1. Revisar diff, hashes y resultados de suite completa; confirmar que G/H no fueron alterados. Commit en `codex/manual-review-fixes`, push y CI SUCCESS para SHA exacto antes de deploy. No main/producción.
2. Cargar exclusivamente en Render Staging los tres campos temporales: `MATEBREAK_DIAGNOSTIC_1008_ENABLED=1`, `MATEBREAK_DIAGNOSTIC_1008_KEY` (secret independiente), `MATEBREAK_DIAGNOSTIC_1008_EXPIRES_AT` (ISO UTC, vencimiento hasta dos horas desde arranque). No mostrar el valor de KEY ni del flag en respuestas.
3. Generar la clave con Generate del panel de Render donde esté disponible, formato base64 256 bits; el patch también acepta 64 caracteres hex. [Render documenta generación de secretos](https://render.com/docs/blueprint-spec#generating-random-secrets). No adoptar/crear un Blueprint para conseguirla: si el panel existente no ofrece generación privada apropiada, detener esa activación para definir su provisión segura con el titular. No modificar otras variables ni secretos.
4. Publicar manualmente sólo Render Staging al SHA exacto, verificar deployment Live, health y arranque real/test. Variables nuevas requieren restart/redeploy para entrar en process.env. Vercel no requiere publicación.
5. Comprobar acceso sin bearer: 401 con flag activo; nunca respuesta de diagnóstico. No consumir pruebas válidas innecesarias. No probar IDs arbitrarios en Cloud: ya se probaron localmente.
6. Titular ejecuta una única petición GET autenticada a la ruta exacta, sin query/body. Se obtienen identidad y resultados minimizados, no headers/token/PII. Si la identidad falla, detenerse. Si Payment.live_mode=true, documentar incompatibilidad sin cambiar guard; aún se consulta Preference por ser diagnóstico readonly.
7. Conservar únicamente ese resultado minimizado y hashes para Informe I; separar resultado API de evidencia manual G/H. No reenvío ni simulación, no compra, no confirmación de #1008.

## Retirada preparada

1. Titular pone ENABLED=0 y aplica restart/redeploy; verificar 404 en ruta exacta, con y sin autenticación, antes de otra investigación. El vencimiento automático es respaldo, no sustituto de retirada.
2. Eliminar server/diagnostics/mp-1008.mjs; import y registro en server/app.mjs; bloque mp1008Diagnostic de environment.mjs; tests específicos y este documento operativo del árbol del candidato. Mantener evidencia minimizada fuera de Git.
3. Eliminar exclusivamente las tres variables temporales, incluida KEY, en Render Staging. No tocar MP_ACCESS_TOKEN ni secreto del webhook.
4. Commit de limpieza, suite y CI exacta; deploy limpio del backend; verificar ausencia de ruta/config/import/debug con rg, health, productos y startup esperado.
5. Verificar 404, ausencia del código temporal en el candidato desplegado y baseline readonly si fue autorizado. Documentar trazabilidad de consultas/logs y que no se exportó token; no afirmar una auditoría absoluta de toda la infraestructura a partir de esas observaciones.
6. Rollback de código disponible: base `3fab7f10773c197bdb1147d42b75d93979beb78f`, con las tres variables temporales quitadas. No rollback SQL/migraciones/stock.

**Punto de detención actual: patch local; esperar autorización explícita antes de commit/push/deploy/habilitación.**
