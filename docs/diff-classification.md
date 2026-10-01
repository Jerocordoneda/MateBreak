# Clasificación del diff respecto de main 15c9d64

Incluye reconstrucción validada y esta iteración; sin borrado de historia ni pérdida de reproducibilidad.

## Tooling local

- `.env.example`
- `package.json`
- `scripts/compare-schema.mjs`
- `scripts/inspect-schema.mjs`
- `scripts/local-supabase.mjs`
- `scripts/local-test-runtime.mjs`
- `scripts/sql/schema-metadata.sql`

## Documentación

- `README.md`
- `docs/baseline-adoption.md`
- `docs/local-development.md`
- `docs/local-network.md`
- `docs/micorreo-architecture.md`
- `docs/schema-reconstruction.md`
- `docs/security-production-checklist.md`

## Snapshots/evidencia

- `docs/schema-metadata/base-dependencies.json`
- `docs/schema-metadata/base-public-schema.json`
- `docs/schema-metadata/base-rls-event.json`
- `docs/schema-metadata/base-role-defaults.json`
- `docs/schema-metadata/local-final-reference.json`
- `docs/schema-metadata/migration-equivalence.json`
- `docs/schema-metadata/remote-final-reference.json`
- `docs/schema-metadata/remote-migration-history.json`
- `docs/schema-metadata/schema-diff.json`

## Generadores

- `scripts/audit-baseline.mjs`
- `scripts/build-historical-catalog.mjs`

## Tests

- `scripts/test-local-auth.mjs`
- `scripts/test-local-logistics.mjs`
- `scripts/test-local-privileges.mjs`
- `scripts/test-local-sql.mjs`
- `scripts/test-local.mjs`
- `scripts/test-order-lifecycle.mjs`
- `scripts/test-stock-concurrency.mjs`
- `supabase/tests/checkout-minorista.sql`
- `supabase/tests/logistics/snapshots.sql`
- `tests/checkout.test.mjs`
- `tests/integration.mjs`
- `tests/local-persist-mock.test.mjs`
- `tests/local-test-guards.test.mjs`
- `tests/micorreo.test.mjs`
- `tests/packaging.test.mjs`
- `tests/providers.test.mjs`
- `tests/security-privileges.sql`

## Aplicación/MiCorreo

- `server/app.mjs`
- `server/checkout/routes.mjs`
- `server/index.mjs`
- `server/providers.mjs`
- `server/shipping/correo-argentino.mjs`
- `server/shipping/jobs.mjs`
- `server/shipping/mock.mjs`
- `server/shipping/packaging.mjs`
- `server/shipping/snapshot.mjs`
- `src/js/checkout.js`
- `src/pages/checkout.html`

## Catálogo histórico

- `supabase/catalog/20260928-public-store.json`
- `supabase/catalog/README.md`
- `supabase/migrations/20260928162850_restore_historical_public_catalog.sql`

## Bootstrap/schema

- `supabase/migrations/20260907203437_bootstrap_legacy_catalog.sql`
- `supabase/migrations/20260929214717_harden_default_privileges.sql`
- `supabase/migrations/20261001003824_micorreo_logistics_snapshots.sql`
- `supabase/platform/harden-admin-defaults.sql`

## Fixtures

- `supabase/tests/fixtures/local-members.sql`
- `tests/concurrency/isolated-schema.sql`

Se conservan los snapshots DDL porque compare-schema/inspect los usan como evidencia. El catálogo público y su SQL generado son necesarios para replay antes de mappings. Logs/captura fresca duplicada quedan fuera de Git. Se eliminó una evidencia nueva redundante de hashes remotos y se consolidó en remote-migration-history.json; el generador reproduce migration-equivalence.json.

El snapshot contiene stock comercial publicado por la tienda (catalog-source.mjs v.stock), no stock físico/interno de Supabase. Cuotas y precios de venta son datos comerciales públicos, no pagos reales ni costos internos. Se revisaron keys anidadas, emails y procedencia: sin clientes, cuentas, contactos privados, pedidos, transacciones, tokens o sesiones.
- `docs/checkout-pagos.md`
- `docs/diff-classification.md`
- `docs/iteration-validation.md`
