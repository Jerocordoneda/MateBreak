# Entrega y validación de la refactorización

Fecha: 2026-10-01. Rama `codex/modular-refactor`, derivada exactamente de `4870fc733d4dccac1dd714e6485e071430eb4b89`. Base del PR: `local-supabase-validation`, cuya punta remota se comprobó en ese mismo commit antes de publicar. No hay merge a main ni cambio silencioso del PR #2.

Workspace: `C:/Users/Administrator/.codex/worktrees/modular-refactor/MateBreak`. El checkout original `C:/Users/Administrator/Desktop/MateBreak` permanece en main y conserva su modificación previa de `.env.example`. El nuevo checkout no modifica `.env.example`, migraciones, catalog fixtures, historia remota ni configuración externa.

## 1–6. Organización y documentación

- [Árbol anterior](tree-before.txt) y [árbol nuevo](tree-after.txt).
- [Justificación y auditoría por responsabilidad](../architecture.md).
- [Archivos movidos](moves.json): 12 implementaciones frontend y tres módulos backend; se mantienen entradas de compatibilidad. Las responsabilidades nuevas extraídas (auth/cart/customer/config/job/Supabase/packaging/transfer-admin) se detallan en arquitectura.
- [Dependencias/rutas/scripts previos](before.json) y [posteriores](after.json): tres ciclos detectados antes, cero después; cero imports/assets faltantes; 88 registradores string originales preservados, más dos rutas nuevas. Arrays/rutas privadas se verifican también vía HTTP.
- [README](../../README.md), [guía de estudio](../learning-guide.md), [ocho diagramas](../flows.md), [embalaje](../packaging.md) y [hosting](../hosting.md).
- Interfaces RPC, cookies, ownership, roles, métodos/rutas existentes, imports públicos compatibles, npm original, Docker local y CI conservados. SHA-256 físico de las 26 migraciones sin cambios.

## 7–8. Embalaje y casos añadidos

La política minorista evalúa cantidades agregadas contra configuraciones aprobadas exactas de un bulto y luego dos, priorizando menor volumen dentro del mismo número de bultos. Perfiles operativos existentes mantienen dimensiones/peso bruto; una aprobación nueva de almacén puede agregarse por configuración backend. No hay bucle que produzca una caja por cada dos sets ni tamaños inventados para pedidos grandes.

Sin perfil aprobado, se ofrece solicitud manual descargable, carrito conservado y sin cobro/reserva; retiro permanece sujeto a su configuración habitual. No hay cola/presupuesto persistente o sistema mayorista implementado. La solicitud se comparte por el canal de atención habitual; el agente no envió mensajes a terceros.

Tests añadidos: 4/6/7/10/100 sets; mezclas 2+2, 4+3, 6+7 y 10+10; perfil sintético grande aprobado en un bulto frente a dos; menor volumen en dos; límites del adaptador; límite público de suma de lados independiente; handoff HTTP sin tarifa/dimensiones/persistencia inventada; descarga con líneas/subtotal servidor; rutas públicas/compatibilidad/secrets. Son 15 tests adicionales, total 159. Los perfiles grandes de los tests son sintéticos, no una aprobación física entregada a producción.

El test previo que esperaba cuatro bultos para 3 sets + 3 mates ahora espera cotización manual: es el cambio de política solicitado, no una eliminación del escenario. La suite conserva los 144 casos base y agrega cobertura.

## 9. Hosting

[Comparación Render/Railway y Vercel](../hosting.md) incluye fuentes consultadas, USD y supuestos; build/start, env, health, API/proxy/cookies, staging, filesystem y estrategia de workers. Build estático probado con `npm run build:frontend`; backend usa `npm start`. `/healthz` verifica proceso, no DB. No se habilitaron deploys, proveedores ni servicios.

## 10. Validación ejecutada

| Comprobación | Resultado / evidencia |
| --- | --- |
| Baseline antes de mover | 142/144 en este worktree Windows oculto: dos 404 de pantallas internas por sendFile/dotfiles; [log](baseline-node.log) |
| Etapa modular | 144/144; [log](modular-node.log). Corrección de paths fijos para worktree oculto, sin ampliar el allowlist estático |
| Embalaje intermedio | 156/156; [log](packaging-node.log) |
| `npm test` final | 159/159, cero fail/skip; [log](final-node.log) |
| `npm run test:full` | Exit 0, suite completa final y cleanup/stop; [log](full-final.log) |
| SQL histórico | 18/18 con fixtures sintéticos rollback, en full y rehearsal |
| SQL logístico | PASS: fingerprint/ownership/expiry/snapshot/claim/admin/recovery/finanzas |
| Privilegios/Auth/RLS | PASS: Auth/JWT, RLS A/B/anon, schema privado, 11 RPC service-only, SECURITY DEFINER; fixtures/accounts locales eliminados |
| Storage | PASS: lectura pública explícita de imagen, listing/upload/delete restringidos |
| Stock concurrente | 20/20 con espera de advisory lock observada |
| Lifecycle | 9/9 |
| Checkout concurrente | 2/2: últimas unidades y retry simultáneo con misma key |
| Recorrido comercial local | Snapshot → pago simulado → claims concurrentes/import mock; cinco casos base, sucursal ficticia, recuperación admin y reject/pending |
| Rehearsal baseline | PASS, stack stop OK; [log](rehearsal.log), [resultado automático](../schema-metadata/baseline-rehearsal-result.json) |
| Resets limpios | Full limpia fixtures con reset y stop; rehearsal reconstruye 26 migraciones, compara schema/defaults/convergencia/fallo intermedio y stop |
| `npm audit` | Cero vulnerabilidades (incluye dev); [JSON](audit.json) |
| Imports/ciclos/assets/scripts | `npm run test:architecture` PASS; scripts originales idénticos y 26 hashes iguales |
| Sintaxis JS | 112/112 con `node --check`; [JSON](syntax.json) |
| Baseline offline | `node scripts/audit-baseline.mjs --check`: 18 migraciones remotas capturadas equivalentes por tokens; solo lectura offline |
| Catálogo histórico | `npm run catalog:historical:check`: 106 productos, 217 variantes |
| Build frontend | `npm run build:frontend` PASS; output allowlist index/src, sin .env/backend |
| HTTP público y privado | Suite Node: rutas principales, entrypoints compatibles, salud, catálogo/checkout/Auth/admin; archivos secretos/repositorio 404 y permisos internos preservados |
| Diff y entorno original | `git diff --check` PASS; main/.env.example original preservados; Docker sin contenedores de test corriendo al terminar |

Node ejecutado: 24.19.0; CLI Supabase fijada 2.118.0, sin actualización. CI conserva Node 22. Full y rehearsal confirmaron exit 0; no se presentan verificaciones offline como consultas remotas ni mocks como aceptación oficial.

## 11. Commits

| Commit | Cambio |
| --- | --- |
| `0ecd0f8` | Inventario antes de mover: rutas, dependencias y hashes |
| `205fc0e` | Features frontend, referencias y eliminación de ciclos de cuenta |
| `707e0bc` | Módulos Auth/carrito/cuenta, config y expiración |
| `a978342` | Adaptador Auth Supabase, servicio de embalaje y transfer-admin |
| `0ac77fe` | Embalaje compacto aprobado, cotización manual y 15 tests añadidos |
| `08ee849` | Build estático frontend y scripts adicionales |
| `702c3d4` | README, guía de estudio, flujos, política y hosting |
| `cdd479b` | Auditoría de assets y path roto en nosotros.html |

Se agrega después de estos commits uno documental con árboles/evidencia final; no contiene cambios de runtime. La lista exacta final se obtiene con `git log --oneline 4870fc7..HEAD`.

## 12. Riesgos y pendientes

No se verificaron cobros, tarifas, login de MiCorreo, importación, despacho ni hosting con proveedores reales. No hay secretos productivos ni publicación de tienda. Supabase Deploy to production se mantiene OFF según la decisión comunicada por el responsable; el agente no inspeccionó/modificó el ajuste externo. El runbook histórico con ON se conserva como evidencia anterior.

Los pesos/perfiles incorporados son estimaciones brutas de la RC. Operación debe medir los bultos reales, certificar composiciones (incluidas variantes) y registrar nuevos perfiles para grandes cantidades. Los límites API conservadores 25 kg/150 cm no se amplían por los máximos públicos de admisión 50 kg/200 cm/suma 300 cm. Comparar alternativas físicas contra tarifas oficiales sigue pendiente: minimizar volumen no prueba precio mínimo global.

La continuación manual es una descarga, no un presupuesto persistente que pueda pagarse directamente desde el checkout. Mayorista flexible y editor de paquetes son futuros. El worker de importación tiene función y claims probados, pero no entrypoint permanente/scheduling real activado. Sender/config y cookies/rate limit tras proxy necesitan staging revisado. Escalar varias réplicas requiere coordinar expiración entre procesos.

`mathjs` y `src/data/gen-data.json` no tienen uso encontrado en el código inspeccionado; se conservan como candidatos a limpieza revisada. Los HTML históricos y multimedia no se borran sin identificar su propósito. Algunos módulos UI/runners permanecen grandes y se describen como candidatos a evolución, no como refactorización completa de cada línea.
