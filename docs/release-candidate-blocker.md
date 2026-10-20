# Release Candidate: control de despliegues antes de publicar y mergear

Actualización 01/10/2026. Main de referencia: `15c9d640075b52721d81be033ba647cef9f3988b`.
La RC continúa desde el commit local `d70277f38b4238a242dff850e488e27fea5e17d0`
en `local-supabase-validation`, dentro del worktree aislado.

## Estado de la integración

El usuario confirmó que desactivó manualmente **Deploy to production**.
Production branch sigue siendo `main`; Automatic branching estaba deshabilitado,
working directory `.`. No hay hosting conectado, según confirmó el usuario.

No se pudo certificar automáticamente el interruptor OFF: el navegador disponible
redirecciona al login de Supabase y los conectores de proyectos/ramas no exponen
ese ajuste. No se inició sesión, modificaron opciones ni pulsaron Deploy/Retry/Reset.
Antes de publicar commits/PR se requiere la reconfirmación del usuario solicitada
en esta tarea. Antes de cualquier merge/rollout se debe comprobar OFF nuevamente.

Autorizar publicación de esta rama y creación del PR **no** autoriza merge,
migration repair remoto, db push remoto, datos productivos, proveedores reales
ni reactivar despliegues. Un check de Supabase fallido no es un seguro.

## Evidencia histórica de solo lectura (30/09)

- Check GitHub `109696369402`, App Supabase, “Supabase Preview”, sobre main
  `15c9d64`, sin PR asociado, enlazado al proyecto `nwpdfqwqxrkokluqqqfs`.
  Falló con “Remote migration versions not found in local migrations directory.”
- Main `43aa55b` y `c2248fcc` tenían el mismo check/error
  (`109638557199` y `109619192312`).
- La rama Supabase `main` apuntaba al proyecto real y mostraba MIGRATIONS_FAILED,
  sin una preview separada. Esto no demuestra que DDL productivo se aplicara.
- Main no estaba protegido (API 404 “Branch not protected”). Webhooks listados:
  ninguno; no deducir ausencia de GitHub Apps a partir de esa lista/otros 404.
- El usuario confirmó entonces Deploy to production ON; después autorizó el
  rehearsal exclusivamente local. El 01/10 confirmó su cambio manual a OFF.

La [integración oficial GitHub de Supabase](https://supabase.com/docs/guides/deployment/branching/github-integration)
puede aplicar migraciones, Edge Functions y buckets al actualizar la rama
productiva. Automatic branching es un automatismo distinto. Cotejar ambos
valores y no resolver history suponiendo que el error impedirá un deploy.

## Automatismos del repositorio y límites

| Acción | Destino/efecto | Control |
|---|---|---|
| security.yml en PR / push main | npm ci, Node tests, audit y verificaciones offline | Sin comandos de deploy/migración |
| test:baseline:local | Repair/push/reset de CLI exclusivamente en stack local propio | Targets/credenciales/labels y puertos fijados; stop en finally |
| test:full | SQL/HTTP/Auth/Storage/concurrencia, fixtures sintéticos y reset local | Nunca producción; stop al finalizar |
| dev/start | BFF al destino configurado; expira reservas si modo real o persisted mock | LOCAL_ONLY exige loopback/mock; no ejecuta migraciones |
| Worker MiCorreo | Claim/import/finish por invocación explícita | Sin scheduler; real rechazado por defecto |
| Importador de catálogo | Escritura administrativa manual | No ejecutado en esta tarea; no depende de tests/CI |
| GitHub App Supabase | Configuración externa | OFF manual requiere confirmación; no cambiar desde el agente |

No se encontraron workflows/configs de Vercel/Render/Netlify/Railway ni deploy
propio. La ausencia de archivos no certifica ajustes externos actuales.

## Configuración original conservada

`C:\Users\Administrator\Desktop\MateBreak\.env.example` mantiene su cambio
local de customerId. Su valor no se imprimió, trasladó al worktree ni publicó.
La RC edita únicamente el ejemplo del worktree aislado: todos los identificadores,
claves y passwords permanecen vacíos. Implementa CORREO_MICORREO_ENVIRONMENT con
alias legacy, y MATEBREAK_LOCAL_PICKUP_MOCK OFF por defecto, solo loopback/mock.

## Trabajo local y siguiente límite

La migración nueva de administración se agrega después de las 25 existentes;
ninguna de esas 25 fue reescrita. Se conservan las 22 canónicas y el ensayo de las
18 versiones alternativas. El rehearsal actualizado comprueba las cuatro
pendientes, fallo parcial del lote y recuperación hacia adelante; consultar
el status actual en [resultado](schema-metadata/baseline-rehearsal-result.json).

Panel/acciones y selector mock: consultar [validación RC](release-candidate-validation.md).
Procedimiento futuro con precondiciones/STOP/recovery:
[runbook](production-release-runbook.md). Configuración:
[inventario de secretos](production-secrets.md).

Producción/history remoto se mantienen sin operaciones. No activar proveedores
reales ni copiar filas productivas a los fixtures. El PR se prepara para revisión
una vez cumplida la confirmación de publicación; **NO HACER MERGE**.
