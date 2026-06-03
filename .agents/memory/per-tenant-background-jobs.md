---
name: Per-tenant background job concurrency
description: How to guarantee at-most-one in-flight background job per tenant and gate result reads on completion.
---

# Per-tenant background scan jobs (full-market scan)

**Rule:** A long-running per-tenant background job (e.g. the full-market scan) must
allow at most ONE in-flight (`pending`/`running`) job per tenant, enforced at the DB
level — not just by an app-side read-then-insert dedupe.

**Why:** A read-then-insert dedupe (`SELECT pending/running … then INSERT`) has a
race: two concurrent POSTs both see "no active job" and both insert + both start
workers, doubling load on the upstream data source and violating the one-job
invariant. An in-process `Set` guard does not help across requests/instances either.

**How to apply:**
- Add a **partial unique index** on `(tenant_id) WHERE status in ('pending','running')`
  (Drizzle: `uniqueIndex(...).on(t.tenantId).where(sql\`status in ('pending','running')\`)`;
  import `sql` from `drizzle-orm`, NOT `drizzle-orm/pg-core`).
- In the POST handler, attempt the insert and catch the unique-violation: on conflict,
  re-query and return the existing active job (idempotent start). Keep the in-process
  Set check + pre-read as cheap fast-paths, but the index is the real guard.
- Verify with parallel POSTs: N concurrent starts must all return the same job id.

**Result reads must be gated on completion:** `GET /scan-jobs/:id/results` returns
`409 {status}` unless `status === 'completed'` (and `404` for missing / cross-tenant).
Returning `200` with `results ?? []` for a running job is misleading (false "empty").
