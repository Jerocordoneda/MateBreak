# Manual review candidate

Base: `bc1cfecf9839f4b6c73569c0d64c0453043fa808`. This candidate is for review;
merging, deployments, commercial SMTP, provider activation and Cloud catalog
writes require separate authorization.

Update 5 October 2026: see `provider-readiness.md` for the definitive two-mate policy and local operations. Migration 38 is revised while still unpublished; migration 39 is also required before the new admin backend. Historical deployment reports and the 19e218c prebuilt are superseded for this candidate.

## Order pricing and recipient

Migration `20261004184020_manual_review_checkout_policy.sql` is additive. Apply
it before the new backend. Preserve migrations 1–37 and existing order rows.
Physical mates come from component quantities, not cart line count. One physical mate
receives no volume promotion; two or more receive 20% off product
subtotal, followed by 10% off the discounted products for transfer. Shipping is
excluded. SQL recomputes prices, inventory and totals; browser totals are not
accepted. New orders persist original subtotal, promotion and physical count.
Previously agreed catalog selling prices remain the base; comparison-price
labels do not trigger an additional checkout discount.

The shared field contract reports `INVALID_RECIPIENT` and a `fields` object.
Pickup needs contact fields. Home delivery additionally needs province, locality,
postal code, street and number. Branch pickup remains explicitly local/mock;
its provider configuration and agency authorization checks remain in force.

## Authentication and mail

The existing PKCE confirmation and recovery callbacks remain supported. A future
confirmation template uses `/auth/confirmar#token_hash=...&type=email`; only the
user's explicit POST consumes the token. Recovery uses the existing PKCE link
and restricted recovery capability. Configure exact origin-specific Auth
redirects for `/auth/callback`, the approved `volver` contexts and
`/auth/recuperar` before a future release. No wildcard redirect is necessary.

Custom SMTP is separate from the backend Resend transport. Verify domain and
DNS before enabling either. Intended sender: `MateBreak <contacto@matebreak.com.ar>`;
Reply-To: `Mate.break32@gmail.com`. Keep sending, workers, receipts,
reconciliation and recovery flags off until independently approved. Never drain
historic outbox events to test delivery. A future single-message test must select
one newly authorized event, recipient and idempotency key, enforce that recipient
allowlist, leave the scheduler off, and stop after the selected event.

## Catalog recovery

Do not rerun `deploy/staging/fixtures.sql` on an active commercial database.
The frozen source is `supabase/catalog/20260928-public-store.json`; complete
migration replay adds the approved mappings, components and SKUs. There are 106
products, 106 catalog sheets, 217 variants, 929 image references and 610 unique
assets. Metadata is not proof of image bytes.

`catalog-recovery-plan.mjs` accepts a read-only snapshot, replays migrations in
an owned disposable database and generates a per-key before/after delta, SQL,
image manifest and two-application rehearsal. It refuses identity/component/
mapping mismatches. Generated SQL guards the original state and Storage paths,
preserves stock and transaction history and is idempotent. The SQL approval
setting is only an execution guard; it does not confer human authorization.

Before any Cloud operation: review the complete delta and image manifest, verify
every original file hash and size, verify the project identity, take a current
protected backup including Auth/history and rehearse restoration in isolation.
Upload only the approved asset paths with `upsert:false`; a collision must be
downloaded and compared, never overwritten. Re-read baseline and snapshot,
then apply the reviewed transaction only with explicit approval. Stop on any
unexpected change. Publishing does not create stock: zero-stock components
still prevent buying the dependent variants.

## Reproduction

Use Node 22, locked dependencies and owned local Docker resources. No Cloud
credentials are needed for tests. Guest/wholesale isolated containers must have
the expected test labels and no published ports.

```sh
npm ci
npm test
node scripts/check-commercial-migrations.mjs
node scripts/audit-baseline.mjs --check
npm run catalog:historical:check
npm audit --audit-level=high
npm run test:local
node scripts/test-guest-sql.mjs
node scripts/test-manual-review-sql.mjs
node scripts/test-commercial-sql.mjs
node scripts/test-preproduction-sql.mjs
node scripts/test-wholesale-account.mjs
node scripts/test-wholesale-commercial.mjs
```

For actual local Auth/Mailpit: start and reset the owned local Supabase stack,
run `preview-manual-review-local.mjs`, then `test-manual-review-auth.mjs`.
The preview intentionally uses synthetic stock and mock payment/shipping;
it refuses an existing order database. Close it and reset/stop the owned stack
after tests. Never use this preview against Cloud.

```sh
node scripts/catalog-recovery-plan.mjs snapshot.json recovery-output
node scripts/verify-catalog-assets.mjs recovery-output/catalog-image-manifest.json assets assets-report.json
```

With `STAGING_BACKEND_ORIGIN=https://matebreak-api-staging.onrender.com`:

```sh
npm run build:staging
node scripts/audit-guest-artifact.mjs public-manifest.json
```

The public audit compares binaries exactly and text against the build's explicit
CRLF-to-LF transformation. It checks strict routing, preserved historical
migration bytes and rejects private/backend/SQL/credential content. This build
does not publish anything. Cloud SMTP, complete Cloud catalog buying and real
provider delivery remain pending until separately authorized and verified.
