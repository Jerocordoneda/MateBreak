# Mercado Pago TEST: fixed Staging account contract

For seller `3741487042` only, the owner approved the observed Checkout Pro test-account Payment contract (`live_mode=true`). This is a scoped account contract, not a generic interpretation of Mercado Pago environments.

Use `APP_ENV=staging`, non-production `NODE_ENV`, `MP_ENVIRONMENT=test`, `MATEBREAK_STAGING_MP_TEST=1`, `MATEBREAK_STAGING_PERSIST_MOCK=0`, `SHIPPING_MODE=mock`, `PAYMENTS_MODE=real`, `MP_COLLECTOR_ID=3741487042` and `MP_EXPECTED_LIVE_MODE=true`. Provider credentials remain private runtime variables.

Every Preference and Payment retrieval authenticates `/users/me` afresh and requires the fixed seller ID and `test_user` tag. The adapter issues in-memory Payment provenance only in this context. Reconciliation requires that provenance, exact collector and exact live-mode equality, plus the existing payment ID, UUID, money, ARS and version checks. A copied response or environment `verified=true` cannot provide provenance. Production cannot enable this exception.

Webhook HMAC remains mandatory. Existing service-only queue processing is a separate authorized recovery path for already queued notifications; it neither simulates HMAC nor creates purchases. Global Staging workers and email/provider activation flags remain off.

An approved Payment for an expired reservation must result in review/financial hold. The existing SQL transaction catches unsafe confirmation, records the observation/hold, and preserves released stock. Duplicate observations return `duplicate`; no reservation is recreated.
