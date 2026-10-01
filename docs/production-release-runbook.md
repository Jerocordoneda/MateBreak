# Liberación manual de MateBreak: procedimiento previo a main

**No ejecutar comandos remotos de este documento en esta iteración.** El usuario
confirmó que GitHub Integration → Deploy to production está **activado**, rama
productiva `main`, working directory `.`, Automatic branching deshabilitado.
El ensayo está limitado al stack local descartable; no autoriza operar producción.

**STOP previo a publicar o mergear:** el responsable debe deshabilitar explícitamente
Deploy to production y comprobar que quedó guardado. No tocar history para resolver
el check de GitHub antes de cerrar esa automatización: al alinear history se podría
desbloquear el próximo despliegue automático. No usar un fallo de migraciones como
protección. No hacer push/PR/merge desde esta tarea mientras siga el bloqueo.

## Ensayo local reproducible

Desde el worktree aislado, sin .env ni credenciales heredadas:

```powershell
npm run catalog:historical:check
node scripts/audit-baseline.mjs --check
npm run supabase:start
npm run test:baseline:local
```

Es destructivo únicamente para `matebreak-local-tests` de este worktree. No usar
ese stack para datos personales. El script rechaza argumentos/targets remotos y
credenciales de proveedor, verifica labels/puertos y detiene el stack en finally.
La advertencia de puertos 0.0.0.0/:: requiere detenerlo al finalizar; no cambia firewall.

El fixture reconstruye 22 migraciones históricas a una base vacía, reproduce las
ACL legacy capturadas y comprueba el metadato public/private capturado contra la referencia
remota ya archivada. Sustituye solamente el history local por las 18 versiones
alternativas. Los statements del fixture son SQL local con tokens equivalentes,
no una copia byte a byte de statements remotos; estos solo se capturaron como hashes.
No se leen ni copian filas productivas.

Ejecuta la CLI real `migration repair ... --status applied --local` (22 versiones)
y luego `... --status reverted --local` (18 alternativas), exactamente en el orden
de baseline-adoption.md, sustituyendo únicamente el destino por --local.
Verifica igualdad de esquema, OIDs de relaciones/funciones/triggers, valores de
secuencias, hashes/conteos/versiones xmin de las 47 tablas locales y default privileges.
Un event trigger temporal observa DDL;
su instalación usa exclusivamente el operador existente del contenedor local, sin
elevar postgres. Las migraciones se ejecutan como postgres, no como supabase_admin.

Después comprueba que dry-run contiene únicamente las tres pendientes, inyecta un
fallo en la revocación de secuencias del hardening, comprueba que lifecycle queda
aplicado, hardening no queda registrado y logística no se ejecuta. Retira únicamente
el fallo sintético, verifica las dos pendientes y continúa hacia adelante. Ejecuta
18 tests SQL históricos y los tests logísticos con rollback. Reconstruye las 25
migraciones desde cero y compara tablas, columnas/tipos, constraints, índices,
funciones, triggers, RLS/policies/grants, secuencias y defaults.

Resumen versionado: `docs/schema-metadata/baseline-rehearsal-result.json`.
Capturas completas locales y logs: `.baseline-rehearsal/` (ignoradas por Git).
El event trigger registra DDL confirmado: sus filas de auditoría también se
revierten cuando una migración falla. El transcript de CLI conserva el statement
fallido; la comparación de ACL/defaults demuestra el rollback de los cambios
parciales del hardening. No interpretar ausencia del DDL fallido en la tabla de
auditoría como ausencia de un intento de ejecución.
No trasladar el event trigger de prueba a producción. No trasladar fixtures ni
resets locales a producción. Consultar el status del resultado, no inferir éxito
de que un comando terminó o de un resultado antiguo.

## Fase 0 — precheck, backup y ventana

**Precondiciones:** revisión humana del commit exacto; Deploy to production OFF
comprobado; sin despliegues concurrentes; ningún job real de MiCorreo activo;
staging autorizado independiente, sin filas productivas, con el ensayo PASS;
backup/PITR vigente y restauración probada; mantenimiento/checkout cerrado durante
los cambios coordinados de backend y SQL. La RC funcional restante sigue pendiente.

Comandos de lectura del checkout aprobado:

```powershell
git status --short
git rev-parse HEAD
node node_modules/supabase/dist/supabase.js --version
node scripts/audit-baseline.mjs --check
npm test
```

Esperado: checkout revisado/limpio, CLI fijada 2.118.0, equivalencias 18/18,
tests sin proveedores externos. Volver a cotejar --help si cambia la CLI.

El operador, en una **futura ventana expresamente autorizada**, prepara backup
recuperable de schema/datos/roles necesarios y Storage mediante herramientas
oficiales/PITR. El dump lógico ordinario no cubre automáticamente Auth, objetos
Storage ni secretos. Probar restauración y documentar RPO/RTO. No copiar filas
productivas al rehearsal local. Guardar backups fuera de Git, cifrados y restringidos.

Respaldar íntegramente schema_migrations, incluidas todas sus columnas/statements,
antes de repair. Por ejemplo, con cliente PostgreSQL compatible y un servicio libpq
`matebreak_release` configurado por el operador en almacenamiento seguro (sin
password en argumentos ni logs):

```powershell
pg_dump --dbname=service=matebreak_release --schema=supabase_migrations --format=custom --file=history-before.dump
pg_restore --list history-before.dump
```

Estos nombres son ejemplos de archivos en el directorio seguro del operador, nunca
en el repo. Verificar destino real, contenido completo y restauración **en staging**;
no ejecutar una restauración contra producción para probar el backup.
Guardar también metadatos/ACL/default privileges anteriores y history ordenado.

**STOP:** automation ON/desconocida, drift nuevo, history no igual al capturado,
hashes distintos, backup sin prueba de restauración, versiones antiguas de migraciones
editadas, falta de permisos o ventanas coordinadas. **Recovery:** cancelar la ventana;
todavía no hubo cambio de DB. No desactivar seguridad ni elevar roles para continuar.

## Fase 1 — adoptar history, sin ejecutar SQL histórico

**Precondiciones:** Fase 0 completa. Referencia remota revisada sigue teniendo las
18 versiones alternativas y bootstrap/catalog ya están físicamente presentes.
Confirmar adopción histórica del catálogo con el responsable; no afirmar igualdad
de filas comerciales actuales con el archivo público archivado.

**Comandos futuros:** usar exactamente los dos `migration repair` y el `migration list`
de [baseline-adoption.md](baseline-adoption.md), con target explícito
`--project-ref nwpdfqwqxrkokluqqqfs`, primero applied de 22, luego reverted de 18.
Autenticación por mecanismo seguro de CLI; no `--password` en línea de comandos.
Los 22/18 argumentos completos están allí y en el resultado del rehearsal local.
Ejecutar cada comando por separado y revisar resultado/exit code antes del siguiente.
En PowerShell, un ejecutable que termina con error no detiene automáticamente el
resto de un bloque: comprobar `$LASTEXITCODE`; no pegar todos los comandos como lote.

```powershell
node node_modules/supabase/dist/supabase.js migration list --project-ref nwpdfqwqxrkokluqqqfs
# Solo tras aprobación de la ventana: los dos repair exactos del documento enlazado.
node node_modules/supabase/dist/supabase.js db push --dry-run --skip-vault --project-ref nwpdfqwqxrkokluqqqfs
```

**Esperado:** history con 22 canónicas; ningún timestamp alternativo; dry-run con
20260929204150, 20260929214717 y 20261001003824, nada histórico. Metadatos de
aplicación sin cambios. **STOP:** aparece bootstrap/catalog/reconciliación, falta una
versión, hay una pendiente nueva o repair falla. No usar include-all ni reset remoto.
**Recovery:** antes de migrar, recuperar únicamente history desde el backup exacto
mediante transacción/procedimiento revisado en staging, cotejando TODAS sus columnas.
No marcar versiones arbitrarias ni reconstruir statements desde hashes. Reverted
elimina registros de history; no revierte el SQL de una migración. Los dos repair
no son una única transacción global, por lo que un fallo exige detenerse y verificar.

## Fases 2–4 — cómo limitar una ejecución a una sola migración

La CLI db push no tiene flag para aplicar una versión individual. No inventar
`--version` para push. Para permitir verificación y STOP entre fases, crear un
artefacto de liberación **nuevo fuera del repo**, con config y copias verificadas
de las 22 históricas más solo las pendientes aprobadas hasta esa fase.
No borrar/renombrar archivos del checkout original ni cambiar sus hashes.

Preparación futura por el operador desde el checkout revisado:

```powershell
$releaseRoot = 'C:\Release\MateBreak\COMMIT_REVISADO'
if (Test-Path -LiteralPath $releaseRoot) { throw 'Usar un directorio nuevo; no sobrescribir.' }
$releaseSupabase = Join-Path $releaseRoot 'supabase'
$releaseMigrations = Join-Path $releaseSupabase 'migrations'
New-Item -ItemType Directory -Path $releaseMigrations | Out-Null
Copy-Item -LiteralPath 'supabase\config.toml' -Destination $releaseSupabase
Get-ChildItem -LiteralPath 'supabase\migrations' -File |
  Where-Object { $_.Name -match '^\d{14}_.*\.sql$' -and $_.Name.Substring(0,14) -le '20260929144308' } |
  Copy-Item -Destination $releaseMigrations
if (@(Get-ChildItem -LiteralPath $releaseMigrations -File).Count -ne 22) { throw 'Baseline inesperado.' }
```

Archivar manifest SHA256 de todos los archivos fuente/copias; exigir igualdad.
Para cotejar las copias antes de cada fase:

```powershell
Get-ChildItem -LiteralPath $releaseMigrations -File | ForEach-Object {
  $releaseSource = Join-Path 'supabase\migrations' $_.Name
  $sourceSha = (Get-FileHash -LiteralPath $releaseSource -Algorithm SHA256).Hash
  $copiedSha = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
  if ($sourceSha -ne $copiedSha) { throw ('STOP: copia modificada: ' + $_.Name) }
}
```

Este artefacto no se publica en GitHub y no incluye .env. No iniciar Supabase local
desde él ni aplicar config.toml remotamente. Usar siempre --workdir explícito,
--project-ref explícito, --skip-vault y sin include-seed/include-roles/include-all.
El ensayo prueba el orden/repair/fallo con el checkout completo; el empaquetado por
fases debe cotejarse además mediante dry-run en staging autorizado antes de producción.

## Fase 2 — lifecycle

**Precondiciones:** history adoptado; snapshot ACL/funciones previo; clientes/backend
compatibles; staging con pruebas de reservas, pagos, transferencias y reintentos.

```powershell
Copy-Item -LiteralPath 'supabase\migrations\20260929204150_fix_minorista_checkout_lifecycle.sql' -Destination $releaseMigrations
node node_modules/supabase/dist/supabase.js db push --workdir $releaseRoot --project-ref nwpdfqwqxrkokluqqqfs --skip-vault --dry-run
if ($LASTEXITCODE -ne 0) { throw 'STOP: dry-run falló.' }
# Esperado: SOLO lifecycle. No continuar si aparece otra.
node node_modules/supabase/dist/supabase.js db push --workdir $releaseRoot --project-ref nwpdfqwqxrkokluqqqfs --skip-vault
if ($LASTEXITCODE -ne 0) { throw 'STOP: lifecycle falló; verificar history/rollback antes de continuar.' }
node node_modules/supabase/dist/supabase.js migration list --workdir $releaseRoot --project-ref nwpdfqwqxrkokluqqqfs
```

**Verificación:** history 23, funciones checkout/pago/transferencia revisadas y trigger
pedido_validar_transicion activo. Tests de concurrencia/lifecycle se ejecutan con
fixtures en staging, **no** con tests destructivos sobre producción. No crear pagos
ficticios en producción. **STOP:** error SQL, nueva carrera, transiciones incompatibles.
**Recovery:** fallo antes de commit requiere verificar rollback/history; después
del commit, forward fix revisado. No revertir pagos/pedidos ni restituir funciones
con carreras conocidas. No presentar migraciones posteriores como rollback de lifecycle.

## Fase 3 — hardening de aplicación

**Precondiciones:** lifecycle verificado; BFF no depende de DML browser; ACL previas
respaldadas; permiso postgres suficiente. No incluir hardening protegido de plataforma.

```powershell
Copy-Item -LiteralPath 'supabase\migrations\20260929214717_harden_default_privileges.sql' -Destination $releaseMigrations
node node_modules/supabase/dist/supabase.js db push --workdir $releaseRoot --project-ref nwpdfqwqxrkokluqqqfs --skip-vault --dry-run
if ($LASTEXITCODE -ne 0) { throw 'STOP: dry-run falló.' }
# Esperado: SOLO hardening.
node node_modules/supabase/dist/supabase.js db push --workdir $releaseRoot --project-ref nwpdfqwqxrkokluqqqfs --skip-vault
if ($LASTEXITCODE -ne 0) { throw 'STOP: hardening falló; verificar history/ACL antes de continuar.' }
```

**Verificación:** history 24; anon/authenticated sin DML legacy ni privilegios de
secuencias revocados; defaults postgres cerrados; funciones internas no ejecutables
por PUBLIC. Cotización/lectura pública autorizada y BFF siguen funcionando con RLS.
**STOP:** privilegios de rol protegido requeridos, exposición amplia, cliente roto.
**Recovery:** si falla, comprobar que history sigue en 23 y que ACL/defaults coinciden
con el backup. Lifecycle no se deshace automáticamente. Corregir la causa y repetir
dry-run: solo hardening y, en un artefacto que la contenga, logística. Nunca marcar
la fallida applied para saltarla. Si ya hizo commit, compensación revisada y limitada
a grants demostrados necesarios con RLS; no reabrir PUBLIC/browser indiscriminadamente.

Los defaults de supabase_admin permanecen separados: `supabase/platform/harden-admin-defaults.sql`
requiere gestión de plataforma y autorización propia. El ensayo NO afirma haber
endurecido ese rol productivo. No elevar postgres ni concederle ese rol.

## Fase 4 — snapshots y jobs logísticos MiCorreo

**Precondiciones:** ambas anteriores verificadas; backend revisado para fingerprint;
worker real apagado; proveedores reales sin activar; nuevas cotizaciones del backend
compatible. Mantener checkout cerrado hasta verificar backend y DB conjuntamente.

```powershell
Copy-Item -LiteralPath 'supabase\migrations\20261001003824_micorreo_logistics_snapshots.sql' -Destination $releaseMigrations
node node_modules/supabase/dist/supabase.js db push --workdir $releaseRoot --project-ref nwpdfqwqxrkokluqqqfs --skip-vault --dry-run
if ($LASTEXITCODE -ne 0) { throw 'STOP: dry-run falló.' }
# Esperado: SOLO logistics snapshots.
node node_modules/supabase/dist/supabase.js db push --workdir $releaseRoot --project-ref nwpdfqwqxrkokluqqqfs --skip-vault
if ($LASTEXITCODE -ne 0) { throw 'STOP: logística falló; conservar estado y diagnosticar.' }
```

**Verificación:** history 25; snapshot/fingerprint de quote, FK de pedido,
snapshot inmutable de envío, tablas private.envio_bulto/envio_importacion_intento,
RLS y ACL backend, funciones mb_shipping_fingerprint/mb_claim_shipment/mb_finish_shipment
cerradas a anon/authenticated. Pedidos antiguos no se importan retroactivamente;
cotizaciones anteriores sin snapshot requieren recotizar. **STOP:** drift/ACL/RPC
incompatibles, snapshot aceptado sin validar, importaciones reales automáticas.
**Recovery:** ante fallo verificar atomicidad real/history, no asumir rollback de
las fases anteriores. Tras commit apagar job/checkout afectado y hacer forward fix;
conservar pedidos, pagos, snapshots, referencias y auditoría. No borrar bultos/history
para fingir reversión ni reenviar importaciones ambiguas.

## Fase 5 — verificación post-migration y decisión de abrir checkout

**Precondiciones:** history exacto 25 y cada fase verificada. Mantener modo real
inactivo hasta que las fases 7/8 tengan autorización y evidencia.

Comandos futuros de lectura:

```powershell
node node_modules/supabase/dist/supabase.js migration list --project-ref nwpdfqwqxrkokluqqqfs
node node_modules/supabase/dist/supabase.js db push --project-ref nwpdfqwqxrkokluqqqfs --skip-vault --dry-run
# Consulta de metadatos para un operador autorizado; este comando solo imprime SQL.
node scripts/inspect-schema.mjs --query
```

**Esperado:** nada pendiente; comparar metadatos, constraints/triggers/funciones,
RLS/policies/grants contra el estado validado; Advisor revisado; permisos de claves
y clientes verificados. Test de negativa anon/A/B y checkout logístico solo en
staging con fixtures. No correr test:local con credenciales/destinos productivos.
**STOP:** cualquier diferencia no aprobada o Advisor de seguridad sin resolver.
**Recovery:** mantener mantenimiento y jobs externos apagados, diagnosticar y corregir
hacia adelante. Restauración completa/PITR exige responsable, pérdida de escrituras
desde backup evaluada y reconciliación con proveedores; no es rollback automático.

## Fase 6 — Auth/security settings manuales

**Precondiciones:** responsable y cambios separados del SQL. **Acciones:** Dashboard
Auth: confirmación de email, URLs exactas HTTPS, contraseñas filtradas, MFA para admins;
API: private no expuesto; Storage: product-images público deliberado sin PII y
escrituras backend; GitHub: protección main, revisiones/checks requeridos y escaneo
de secretos. Ver security-production-checklist.md.
**Esperado/verificación:** intentos sin sesión, con cuenta ajena y metadata de rol
editable no escalan permisos; sesión/confirmación/reset funcionan en staging.
**STOP:** redirects amplios, rol desde user_metadata, secret expuesto, política pública
de escritura. **Recovery:** registrar configuración anterior, revertir solo el ajuste
incorrecto; no desactivar controles de seguridad para aprobar pruebas.

## Fase 7 — Mercado Pago (futura, con credenciales)

**Precondiciones:** credenciales oficiales de ambiente, webhook firmado y origen
HTTPS, conciliación/alertas probadas y autorización independiente. **Configuración:**
secret manager con MP_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET; PAYMENTS_MODE=real
solo para rollout aprobado. No activar cobro real con envío mock: el backend lo rechaza.
Coordinar el rollout con Fase 8, no abrir checkout a mitad de la configuración.
**Verificación:** pruebas oficiales de ambiente, firma, importe/moneda/idempotencia,
reintentos y recuperación de preferencias/expiración. MP_PUBLIC_KEY está documentada
pero Checkout Pro actual no la usa.
**STOP:** origen/token/entorno incorrectos, firma inválida, pagos duplicados o cambio
de stock por callbacks no verificados. **Recovery:** cerrar checkout; conservar pagos,
referencias y auditoría, conciliar externamente y rotar secretos si hubo exposición;
no cancelar/reembolsar operaciones reales automáticamente.

## Fase 8 — MiCorreo (futura, con credenciales API)

**Precondiciones:** Correo entrega user/password específicos API; no usar login normal
de MiCorreo; customerId/origen confirmados; packaging físicamente medido con tolerancias;
servicio/import compatible y declaredValue aprobados; recovery administrativo de
ambigüedades y observabilidad listos. Ese panel/acciones siguen pendientes de la RC.
**Configuración:** CORREO_MICORREO_USER/PASSWORD/CUSTOMER_ID, CORREO_ORIGIN_POSTAL_CODE
en backend; variable de ambiente actual CORREO_ENVIRONMENT. La propuesta de nombre
CORREO_MICORREO_ENVIRONMENT aún no está implementada: no asumir que surte efecto.
SHIPPING_MODE=real solo con autorización explícita y cotizaciones oficiales de /rates.
**Verificación:** /token, rates, import por bulto y referencias estables en ambiente
oficial de prueba. Agencies y users/validate según alcance; nunca loguear tokens/body.
**STOP:** timeout/5xx/duplicado ambiguo → revisión manual, sin retry ciego ni nueva
extOrderId. Confirmar existencia/no existencia por medios oficiales disponibles;
no inventar API de búsqueda. **Recovery:** conservar claim/resultado; conciliar por
referencia y auditar acciones. Solo retry seguro confirmado con la misma referencia.
El worker real sigue sin scheduler; runShipmentJob rechaza real salvo allowReal
explícito. La futura feature flag/scheduler requiere implementación revisada:
no hay un flag de entorno ya operativo que habilite el job en esta rama.

## Resultado que autoriza considerar un merge

Deploy to production OFF verificado; rehearsal PASS; RC funcional restante completa;
tests exigidos verdes; runbook por fases ensayado en staging autorizado; responsable
del rollout y backups aprobados. Solo entonces preparar PR, todavía sin merge
automático. **Este procedimiento no migra producción automáticamente.** Esta
afirmación depende de deshabilitar la integración externa, no solo de revisar Actions.
