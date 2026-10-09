# Arquitectura y auditoría de la refactorización

Base: commit `4870fc733d4dccac1dd714e6485e071430eb4b89`, nueva rama `codex/modular-refactor`. El checkout original en `main` y su modificación previa de `.env.example` se conservan. No se reescribe la RC, no se hace merge ni se cambia SQL histórico.

## Inventario previo y posterior

[Árbol anterior completo](refactor/tree-before.txt), [árbol nuevo completo](refactor/tree-after.txt), [mapa anterior](refactor/before.json), [mapa posterior](refactor/after.json) y [movimientos](refactor/moves.json). Los mapas incluyen inventario de archivos, imports estáticos/dinámicos relativos, archivos grandes, registradores de rutas, scripts npm y SHA-256 de las 26 migraciones. El árbol muestra archivos versionables, sin node_modules, .env, output de build ni volúmenes temporales.

Resumen anterior:

```text
index.html
src/{js,pages,services,css,assets,data,i18n}
server/{index,app,account,catalog,inventory,providers,security}.mjs
server/{checkout,payments,shipping,private-ui}/
supabase/{migrations,platform,tests,catalog}/ + config.toml
scripts/ + scripts/sql/
tests/ + tests/concurrency/
docs/ + docs/schema-metadata/
tools/ .github/workflows/ package.json package-lock.json
```

Resumen posterior:

```text
src/features/{account,catalog,cart,checkout}/
src/js/                      Entradas compatibles + interacciones de presentación
src/{pages,services,css,assets,data,i18n}/
server/index.mjs             Punto de arranque, listener y timeouts
server/app.mjs               Composición, contexto de request y allowlist pública
server/config/environment.mjs
server/modules/{auth,cart,account,catalog,inventory}/
server/integrations/supabase/auth.mjs
server/jobs/expire-reservations.mjs
server/checkout/{routes,policy,mock-store,packaging-service}.mjs
server/payments/{routes,admin-routes,mercadopago,mock,transferencia}.mjs
server/shipping/{packaging,carrier-limits,correo-argentino,mock,snapshot,jobs,admin}.mjs
server/private-ui/ + wrappers account/catalog/inventory.mjs
supabase/ tests/ scripts/ tools/ .github/   Contratos existentes conservados
README.md docs/{learning-guide,architecture,flows,packaging,hosting}.md
```

## Decisiones por responsabilidad

| Área | Responsabilidad y decisión |
| --- | --- |
| Frontend | HTML multipágina y módulos nativos. Cuenta, catálogo, carrito y checkout por feature; CSS/assets permanecen públicos sin moverlos por estética |
| Composición | `createApp` valida origen, inyecta clientes/proveedores y registra rutas. Conserva identidad/cookie por request, orden de middleware, helpers de RPC y manejo final de errores |
| Auth | Rutas separadas en `modules/auth/routes.mjs`; integración de cookies Supabase en `integrations/supabase/auth.mjs`; no se implementa un generador JWT nuevo |
| Cuenta | Operación por rol en `modules/account/routes.mjs`; perfil/direcciones/pedidos propios en `customer-routes.mjs` |
| Carrito | `modules/cart/routes.mjs` registra los mismos métodos/rutas y delega invariantes transaccionales a PostgreSQL |
| Checkout | Orquestación HTTP, política financiera pura y mock-store separados. La consulta de productos para embalaje vive en `packaging-service.mjs`; confirmación administrativa de transferencias en `payments/admin-routes.mjs` |
| Adaptadores | `payments/mercadopago.mjs` y `shipping/correo-argentino.mjs` ya eran módulos cohesivos. Permanecen allí, en vez de añadir rutas largas y wrappers innecesarios a todas las dependencias |
| Logística | Perfiles/planificación, límites externos, snapshot, worker y UI administrativa siguen separados. No se programa importación real automáticamente |
| Inventario | Rutas y controles de equipo en su módulo; SQL continúa siendo la autoridad sobre stock/cajas/reservas; pantallas privadas fuera del allowlist `/src` |
| Config/jobs | `loadConfig` es invocable sin iniciar Express; `index.mjs` es el único arranque web. Expiración independiente e inyectada con cliente admin |
| Tests/scripts | Se conserva la organización efectiva: Node en `tests/`, SQL histórico en `supabase/tests/`, fixtures concurrentes en `tests/concurrency/` y runners en `scripts/`. No se cambian globs/npm/CI por una clasificación artificial |
| BD/migraciones | 26 archivos sin mover, renombrar ni editar. Tests/fixtures/bootstrap local y catálogos históricos también preservados |

Los imports internos apuntan a la implementación, con exports nombrados. Los wrappers antiguos contienen únicamente re-export explícito o import del entrypoint de navegador; no duplican lógica. Las páginas/scripts de generación usan las rutas nuevas. No se agregaron barrels genéricos.

## Hallazgos de la auditoría

`app.mjs` tenía 211 líneas y registraba Auth, carrito, perfil/direcciones/pedidos junto con composición/static/security. Queda en aproximadamente 109 líneas y delega esas rutas, sin separar cada handler en una clase. `index.mjs` pasa de 70 líneas a 13; entorno y expiración tienen módulos propios. Los números exactos del snapshot usan conteo de líneas, no complejidad cognitiva.

El mapa previo detectó tres ciclos explícitos relacionados con `account.js`: los módulos secundarios importaban helpers del módulo que los cargaba dinámicamente e iniciaba la página. `src/features/account/ui.mjs` contiene los helpers sin iniciar la pantalla; las implementaciones importan allí. El mapa posterior no detecta ciclos ni imports relativos inexistentes.

Archivos grandes que permanecen: `src/js/video-carousel.js` (343 líneas, presentación), `src/features/checkout/checkout.js` (estado de pantalla), `server/checkout/routes.mjs` (orquestación), runners de concurrencia/rehearsal e UI interna de inventario. No se parte una transacción de pruebas o una interacción visual en capas solo para reducir líneas. Son candidatos a iteraciones enfocadas, con escenarios de aceptación propios.

Hay repetición visual en HTML generado y formateo/HTTP en features. Se mantiene donde los contratos difieren; consolidar todo con un framework o un helper universal ampliaría el riesgo. `wire-catalog-pages.mjs` se actualizó a las nuevas rutas de features.

Candidatos sin uso encontrado: `mathjs` figura como dependencia pero no se encontraron imports/referencias en src/server/scripts/tests/tools; `src/data/gen-data.json` no tiene consumidor encontrado. `src/i18n/es-source.json` sí es salida de `tools/extract-strings.mjs`. No se eliminan datos/dependencias sin una revisión específica de su propósito histórico. Recursos multimedia y páginas históricas se preservan.

Se corrigieron dos defectos de referencias detectados al validar: las pantallas internas fallaban al hacer sendFile desde un worktree bajo `.codex` (dotfiles); se permitió ese directorio únicamente para archivos fijados por el servidor, manteniendo `/src` con dotfiles deny. `nosotros.html` apuntaba a `src/pages/script.js` inexistente y ahora referencia `src/js/script.js`. No se cambian permisos, endpoints comerciales ni reglas financieras.

## Interfaces conservadas

El auditor compara los 88 registradores string de la base y detecta 90 posteriores: se añaden `/healthz` y `/api/checkout/cotizacion-manual`. Las rutas en arrays y las pantallas privadas registradas dinámicamente se comprueban con tests HTTP existentes/nuevos. El inventario por regex es una ayuda de revisión, no un parser completo de Express ni prueba de equivalencia de handlers.

Se conservan métodos y paths de catálogo, carrito, variantes, compra directa, cuenta, checkout, webhook, transferencias, inventario, logística y callback; cookies/ownership/roles; contratos RPC, fingerprint/snapshot por bulto; imports externos compatibles de account/catalog/inventory y módulos de navegador; scripts npm originales; config local de Docker y workflow CI. Las rutas nuevas y la respuesta manual HTTP 202 son los cambios funcionales solicitados, junto con el máximo operativo de dos bultos automáticos minoristas.

Las invariantes financieras no se modificaron. El embalaje deja de extrapolar cajas para pedidos grandes; la continuación manual es una descarga para atención, no un nuevo sistema de presupuestos almacenados. [Detalles y límites](packaging.md).

## Validación y evolución

[Resultados completos](refactor/validation.md) y logs por etapa. No se recortó la suite: el test mixto que esperaba cuatro bultos cambia de expectativa porque esa es exactamente la política solicitada; se agregan escenarios grandes/mixtos, límites independientes y handoff HTTP. Las mediciones/perfiles físicos pendientes y la aceptación oficial de proveedores no se sustituyen con tests sintéticos.

[Hosting](hosting.md) evalúa servicio único Node, Vercel con proxy y worker separado, con costos/supuestos y fuentes. No hay conexión, deploy automático ni infraestructura nueva. Los documentos históricos de release se conservan como evidencia de su fecha; README distingue el estado OFF comunicado por el responsable de los bloqueos antiguos con deploy ON.
