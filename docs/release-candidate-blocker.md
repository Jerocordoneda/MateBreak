# Release Candidate detenido: integración GitHub de Supabase

Inspección del 30/09/2026. Main: `15c9d640075b52721d81be033ba647cef9f3988b`.
Rama revisada: `local-supabase-validation`, base `ca8150bfd76beffcc705e68969e6957f02128c46`.

## Condición de STOP encontrada

Actualización confirmada por el usuario desde el Dashboard: Production branch
`main`, **Deploy to production ACTIVADO**, Automatic branching deshabilitado/no
disponible en el plan y Working directory `.`. No cambió opciones ni ejecutó
Deploy/Retry/Reset. El bloqueo de push/PR/merge permanece; el usuario autorizó
continuar exclusivamente el rehearsal local y el procedimiento previo al merge.

El usuario pidió detener la preparación del PR si main dispara despliegues o
migraciones productivas automáticas. Hay una integración externa de Supabase
activa, además del workflow versionado de GitHub Actions. No es seguro afirmar
que un merge no migra producción automáticamente: el despliegue automático está
confirmado activado.

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

En la primera detención solo se había reconstruido la base histórica; eso no
constituía evidencia de repair. Después de confirmar las opciones del Dashboard,
el usuario autorizó continuar localmente. El rehearsal automático ahora pasó:
history 18 alternativas → 22 canónicas, cero DDL durante repair, mismos OIDs,
datos/versiones xmin/secuencias y defaults. Fallo inyectado en hardening dejó
history 23, revirtió ACL parciales y no ejecutó logística. Se recuperó hacia adelante
hasta history 25 y el esquema converge con un reset limpio de las 25 migraciones.
DDL confirmado de migraciones: 47 eventos observados. Tests SQL históricos 18/18
y logísticos aprobados. Ver resultado automático y runbook enlazado.

Se agregaron el script de rehearsal, comparador, guardrails/test, warning de puertos,
CI offline de equivalencias/generador y documentos operativos. No se cambiaron
migraciones de aplicación, proveedores, firewall ni Docker daemon.
La UI logística, acciones administrativas y sucursales mock siguen pendientes
de la RC funcional original. El bloqueo de publicación/merge sigue vigente.

## Paso manual previo a continuar

1. Abrir el proyecto MateBreak en [Supabase Dashboard](https://supabase.com/dashboard/project/nwpdfqwqxrkokluqqqfs).
2. Entrar en **Project Settings → Integrations → GitHub Integration**.
3. Los valores ya están confirmados: Deploy to production ON para main,
   Automatic branching OFF. Antes de publicar/mergear o reparar history remoto,
   el responsable debe deshabilitar explícitamente Deploy to production y verificar
   que se guardó. Esa intervención no fue autorizada ni realizada por el agente.
4. No pulsar Deploy/Retry/Reset, no aceptar migration repair automático y no
   cambiar history. No desvincular ni borrar el proyecto o ramas.
5. Volver a esta conversación con la confirmación del cambio, sin compartir claves.
   El ensayo local ya está autorizado y completado; la preparación/publicación
   de la RC requiere cerrar el automatismo productivo.

No se creó PR, no se hizo push ni merge. No se modificaron producción, history
productivo o configuración de integración; no se ejecutaron migrations remotas.
No se cargaron credenciales reales de Supabase/MP/MiCorreo en scripts o tests.
Las consultas de metadatos de GitHub y ramas usaron conectores autenticados de
solo lectura; esto no equivale a haber usado claves productivas en la aplicación.
No se activó ningún proveedor real.
