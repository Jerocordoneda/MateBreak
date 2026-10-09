# Reconstrucción del esquema anterior a Supabase

Baseline `15c9d64`, rama aislada `local-supabase-validation`, 30/09/2026.
El repositorio original y su `.env` no se modificaron. El baseline está publicado
en GitHub; `main` no recibió estos cambios.

## Recuperación del DDL

La primera migración asumía producto/producto_simple/combo/combo_item existentes.
La segunda asumía `rls_auto_enable()` y el event trigger `ensure_rls`.
Se recuperaron desde pg_catalog del proyecto real únicamente mediante
transacciones READ ONLY. No se seleccionaron filas de negocio ni usuarios.

`20260907203437_bootstrap_legacy_catalog.sql` reconstruye las cuatro tablas,
identity bigint GENERATED ALWAYS (secuencia min/start/increment/cache 1,
max 9223372036854775807, sin ciclo), PK/FK/checks/índice, RLS sin policies,
la función DDL SECURITY DEFINER con search_path pg_catalog y el event trigger.
La definición y nombres proceden de los JSON `schema-metadata/base-*`.
La evidencia base-role-defaults conserva el máximo de secuencia como texto.

Los DROP NOT NULL posteriores permiten recuperar la nulabilidad inicial de
precio/material/stock. Source URL, external ID, slug y moneda pertenecen a la
migración catalog_import y no se adelantan. No se inventó la columna eliminada
en producto_simple cuyo attnum deja un hueco. No hay enums personalizados previos.
Schemas/roles Auth y extensiones de plataforma los prepara Supabase; private y
el resto de objetos de negocio se crean en las migraciones ya existentes.

El bootstrap usa permisos cerrados para service_role. No reproduce grants
innecesarios de anon/authenticated heredados en las tablas base. RLS, sus policies,
tipos, defaults, checks y FKs finales coinciden con los metadatos remotos.

## Catálogo comercial reproducible

Estrategia: archivo comercial versionado + generador offline + puente histórico
SQL inmutable; fixtures de tests por separado.
`supabase/catalog/20260928-public-store.json` procede del extractor de páginas
públicas archivado localmente, no de filas Supabase. Contiene 106 publicaciones,
217 variantes y metadatos de 929 referencias a imágenes comprobadas por SHA256.
No incluye binarios, clientes, pedidos, pagos, usuarios ni credenciales.

`20260928162850_restore_historical_public_catalog.sql` llama al importador SQL
existente después de su definición y antes del primer mapping histórico.
Se genera con `scripts/build-historical-catalog.mjs`; `--check` verifica hash
y contenido. Normaliza CRLF para ser reproducible entre plataformas.
Las nuevas versiones comerciales no deben modificar el snapshot histórico.

Un seed al final no puede satisfacer reconciliaciones durante las migraciones.
Se conservaron todas sus assertions:

| Assertion | Clasificación | Replay |
| --- | --- | --- |
| 6 variantes camionero | Validación histórica del catálogo | Pasó |
| 68 variantes / 130 componentes | Validación histórica del plan físico | Pasó |
| 16 variantes de termos | Validación histórica de publicaciones | Pasó |
| 84 variantes / 296 componentes | Validación histórica de combos | Pasó |
| 2 premium pendientes / 2 bases / 12 componentes / 217 aprobadas | Validación histórica de cierre | Pasó |
| Cajas por mate, cantidades positivas, mapping completo | Invariantes operativos | Pasó |

Ningún conteo se relajó ni se reemplazó por fixtures inventados. Stocks físicos
iniciales: permanecen en la migración de inventario existente. Los tests reciben
usuarios y disponibilidades ficticias dentro de sus transacciones.

## Excepción demostrada en una migración histórica

La última migración intentaba alterar defaults de supabase_admin como postgres:
SQLSTATE 42501. El remoto también confirma que postgres no es superuser ni miembro
del rol interno. Con autorización expresa del usuario se separaron esas cuatro
instrucciones a `supabase/platform/harden-admin-defaults.sql`. Se conservaron
todos los REVOKE de tablas/secuencias/RPC y defaults del creador de aplicación.
No se otorgaron roles adicionales ni se modificó producción.
La prueba de privilegios comprueba ambas políticas en un clúster descartable como
operador; **no demuestra** aplicación de la política de plataforma en el remoto.

Referencias: [roles de Supabase](https://supabase.com/docs/guides/database/postgres/roles-superuser),
[CLI 2.118.0 con postgres](https://github.com/supabase/cli/blob/v2.118.0/apps/cli/src/command-internal/db-bootstrap/db-setup.ts),
[seeds posteriores a migraciones](https://supabase.com/docs/guides/local-development/seeding-your-database).

## Comparación final con metadatos remotos

Los JSON remote-final-reference/local-final-reference y schema-diff conservan
estructura completa y comparación reproducible. No contienen valores de filas.

- Coinciden 47 tablas, 302 columnas, 220 constraints, 106 índices y 9 policies,
  incluyendo tipos, defaults, PK/FK, RLS/force RLS y ACL de funciones.
- Local añade mb_validar_transicion_pedido y el trigger pedido_validar_transicion.
- Difieren mb_checkout_catalogo, mb_checkout_minorista, mb_confirmar_pago y
  mb_confirmar_transferencia: arreglo lifecycle ya versionado, pendiente en remoto.
  Las otras 30 funciones remotas coinciden tras normalizar formato.
- Local retira grants anon/authenticated de producto/combo/combo_item y tres
  secuencias; endurecimiento pendiente en remoto.
- Defaults de supabase_admin: pendientes de operación de plataforma.
  No se encontraron otras columnas/constraints/índices/policies sin versionar.

No se creó otra migración de drift para cambios ya contenidos en las migraciones
pendientes. Event trigger y tablas originales quedan en el retro-bootstrap.
No se desplegó ninguna corrección remotamente.

El retro-bootstrap y el puente de catálogo son para reconstruir proyectos vacíos.
No deben ejecutarse sobre el proyecto real ya poblado: las tablas y ese estado
histórico ya existen allí. Adoptar estas versiones en su migration history requiere
un plan revisado de baseline/staging, sin reejecutar DDL ni importar el snapshot
en producción. No se hizo esa reparación de historial en este trabajo.

## Validación y límites

Dos resets completos desde cero pasaron, seguidos de la suite local:
Node 80/80, SQL 18/18, privilegios 1/1, stock concurrente 20/20,
lifecycle 9/9 y concurrencia minorista 2/2; Auth/JWT/RLS A/B/anon,
7 RPC service-only, SECURITY DEFINER, Storage y checkout HTTP mock persistido.
La suite limpia cuentas/pedidos sintéticos mediante otro reset local.

La observación de locks conserva su assertion: el fixture espera 1,25s para
permitir al observador de Docker Desktop comprobar la contención real.
La preparación del clúster prueba TCP, evitando confundir el servidor temporal
de sockets de la imagen PostgreSQL con el proceso final.

Storage permite leer una imagen pública deliberadamente; anon/clientes no pueden
enumerar, subir ni eliminar objetos. El catálogo público muestra detalles comerciales
y señales booleanas de disponibilidad, sin cantidades de stock interno.
No se descargan ni suben imágenes al reset.

Los destinos de todos los tests son loopback y el clúster concurrente no publica
puertos. Sin embargo, CLI publica el stack Supabase en todas las interfaces del
host. Se probó la [opción oficial de Docker bridge](https://docs.docker.com/engine/network/drivers/bridge/)
y no corrigió los listeners Windows; se retiró el cambio. La suite limpia y
detiene Supabase al terminar, conservando volúmenes. Queda pendiente resolver/verificar
bindings explícitos antes de dejarlo activo permanentemente. No se cambió el
firewall, daemon global ni seguridad de Windows.

NO se copiaron datos personales de producción.
NO se aplicaron migraciones al Supabase real.
NO se hicieron pruebas destructivas remotas.
NO se activaron proveedores reales.

La validación local no sustituye staging, MFA/redirects/backups ni contratos reales
de Mercado Pago/MiCorreo. Requiere revisión antes de merge/deploy y gestión de
plataforma para la política del rol interno.
