# Release Candidate detenido: integración GitHub de Supabase

Inspección del 30/09/2026. Main: `15c9d640075b52721d81be033ba647cef9f3988b`.
Rama revisada: `local-supabase-validation`, base `ca8150bfd76beffcc705e68969e6957f02128c46`.

## Condición de STOP encontrada

El usuario pidió detener la preparación del PR si main dispara despliegues o
migraciones productivas automáticas. Hay una integración externa de Supabase
activa, además del workflow versionado de GitHub Actions. No es seguro afirmar
que un merge no migra producción automáticamente.

Evidencia obtenida exclusivamente por consultas de lectura:

- GitHub check `109696369402`, app `supabase`, nombre `Supabase Preview`,
  asociado al SHA de main `15c9d64`, sin pull requests asociados, iniciado
  `2026-09-30T01:21:04Z`. Su salida dice
  `Remote migration versions not found in local migrations directory.`
  El enlace apunta al proyecto real `nwpdfqwqxrkokluqqqfs`.
- Los commits anteriores de main `43aa55b` y `c2248fcc` tienen el mismo check
  externo y error (checks `109638557199` y `109619192312`).
- La consulta de ramas de Supabase devuelve una rama `main`, `is_default=true`,
  `git_branch=main`, `project_ref=nwpdfqwqxrkokluqqqfs`, con estado
  `MIGRATIONS_FAILED`; no devuelve una preview separada para esos commits.
- La API de protección de main responde `Branch not protected` (404).
  Un check fallido no debe tratarse como una barrera de merge garantizada.

La evidencia muestra procesamiento automático de migraciones asociado a main
y al proyecto real. No demuestra que haya ejecutado DDL correctamente, ni
permite leer el valor actual del checkbox `Deploy to production`. Ese ajuste
debe comprobarse en el Dashboard antes de continuar. Un fallo por history
desalineado tampoco es un mecanismo de protección: al corregir el history,
el siguiente intento podría avanzar.

Según la [documentación oficial de la integración GitHub de Supabase](https://supabase.com/docs/guides/deployment/branching/github-integration),
`Deploy to production` aplica nuevas migraciones, Edge Functions declaradas y
buckets Storage al hacer push/merge en la rama productiva. `Automatic branching`
puede crear entornos y ejecutar migraciones al crear ramas/PRs o actualizar commits.
No se inspeccionó ni modificó ningún secreto del proyecto.

## Automatismos inspeccionados

| Acción | Trigger | Qué hace | Ambiente | Riesgo |
|---|---|---|---|---|
| `.github/workflows/security.yml` | Push main / pull_request | npm ci, Node tests, npm audit | Runner GitHub | No contiene deploy ni migraciones; npm audit consulta registro de paquetes |
| Integración externa Supabase | Checks observados en commits main | Comprobación/procesamiento de migraciones; falla por history alternativo | Check enlazado al proyecto real | STOP: verificar Deploy to production y Automatic branching en Dashboard |
| Hosting frontend/backend | No encontrado en archivos; usuario confirmó que no hay hosting conectado | No se encontró deploy versionado | No identificado | La confirmación del usuario no descarta la integración Supabase observada |
| Webhooks del repositorio | Consulta GitHub devolvió lista vacía | Sin webhooks listados | GitHub | Las GitHub Apps no aparecen necesariamente como webhooks del repo |
| GitHub Pages | Consulta respondió 404 | No verificado como activo | GitHub | 404 no certifica ausencia de otros proveedores externos |
| Hooks Git locales | Sin core.hooksPath configurado; sin hooks versionados | No hay automatización de deploy versionada | Checkout local | No publicar esta iteración hasta esclarecer integración externa |
| npm test | Manual / CI | Tests Node con dobles | Proceso local/runner | No carga .env ni ejecuta migrations |
| test:local / test:full | Manual, solo rama de trabajo | Suite destructiva controlada, reset y stop | Stack local identificado por labels y puertos | No ejecutar contra datos locales propios; no admite claves heredadas ni target remoto |
| supabase:start / status / reset:local / stop | Manual | Wrapper con proyecto/puertos locales fijados | Supabase local | reset borra fixtures locales; puertos pueden publicarse en todas las interfaces, detener al terminar |
| npm dev / start | Manual o eventual hosting | Carga .env, inicia BFF | El destino SUPABASE_URL configurado | Puede conectarse a remoto si se quita LOCAL_ONLY; no ejecuta migrations. Con payments real programa expiración de reservas |
| Importación de catálogo | catalog:import manual | Carga .env, escribe catálogo/Storage por API | SUPABASE_URL configurado | Operación de escritura administrativa; no ejecutar en esta iteración. No es migration ni dependencia de dev/test/CI |
| catalog:reconcile | Manual | Lectura de inventario y catálogo, genera CSV | SUPABASE_URL / origen configurados | Requiere credencial backend; no ejecutado |
| Worker MiCorreo | Invocación explícita de runShipmentJob; sin scheduler | Claim/import/finish por bulto | Proveedor configurado; real rechazado por defecto | No activado; activación futura necesita revisión explícita |
| postinstall / cron / deploy config | No encontrados como scripts propios/versionados | Sin automatismo propio identificado | — | Los paquetes instalados y Apps externas son superficies distintas |

La inspección cubrió el árbol versionado y scripts de ambas referencias; no se
encontraron configuraciones Vercel/Render/Netlify/Railway ni workflows de despliegue.
Las consultas de installations del repo y Pages respondieron 404; no se dedujo
ausencia de Apps a partir de esos errores. Los checks sí prueban la App Supabase.

## Cambio original de .env.example

En `C:\Users\Administrator\Desktop\MateBreak`, la única línea modificada
respecto de main es `CORREO_MICORREO_CUSTOMER_ID`: estaba vacía y ahora tiene un
valor de 10 caracteres. Se retiene como configuración backend; su valor no se
imprimió, copió ni agregó a esta rama. El archivo original permanece intacto.
La propuesta final de variables y el cambio a `CORREO_MICORREO_ENVIRONMENT`
siguen pendientes; no se sobrescribió configuración para anticipar la RC.

## Trabajo local realizado y límites

Se inició exclusivamente el stack descartable del worktree y se hizo un reset
local hasta `20260929144308`, aplicando los 22 archivos históricos a una base
vacía. Esto prepara la estructura histórica, pero **no es todavía el rehearsal**:
no se sustituyó history por los 18 timestamps alternativos, no se ejecutó
migration repair ni se demostró convergencia/fallo intermedio. No presentar ese
reset como evidencia de seguridad de la adopción sobre objetos preexistentes.

Al detener esta iteración se restauró el estado local con los 25 archivos de la
rama mediante el wrapper de reset local y se detuvo el stack conservando volúmenes.
No se cambiaron código, SQL, proveedores, firewall ni Docker daemon.
No se repitieron las suites ya cerradas: los cambios de esta iteración son documentación.
La RC, ensayo de history, UI logística, sucursales mock, runbook completo y nueva
validación final quedan pendientes de resolver el bloqueo.

## Paso manual previo a continuar

1. Abrir el proyecto MateBreak en [Supabase Dashboard](https://supabase.com/dashboard/project/nwpdfqwqxrkokluqqqfs).
2. Entrar en **Project Settings → Integrations → GitHub Integration**.
3. Revisar repo, working directory, production branch, **Deploy to production**,
   **Automatic branching** y **Supabase changes only**. Informar sus valores sin
   compartir claves. Para la liberación manual solicitada, Deploy to production
   debe quedar deshabilitado mediante una decisión explícita del responsable.
   Los previews automáticos también deben quedar resueltos antes de publicar
   commits/abrir PR, porque esta tarea prohíbe ejecutar migrations remotas.
4. No pulsar Deploy/Retry/Reset, no aceptar migration repair automático y no
   cambiar history. No desvincular ni borrar el proyecto o ramas.
5. Volver a esta conversación con el estado de los controles. Confirmar primero
   el mecanismo seguro; después se retoma el ensayo local y la preparación de RC.

No se creó PR, no se hizo push ni merge. No se modificaron producción, history
productivo o configuración de integración; no se ejecutaron migrations remotas.
No se cargaron credenciales reales de Supabase/MP/MiCorreo en scripts o tests.
Las consultas de metadatos de GitHub y ramas usaron conectores autenticados de
solo lectura; esto no equivale a haber usado claves productivas en la aplicación.
No se activó ningún proveedor real.
