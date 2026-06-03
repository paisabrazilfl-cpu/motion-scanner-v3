# Motion Scanner v3.0

A full-stack, multi-tenant, SOC 2-aligned stock scanning platform with tri-state qualification (GO/HOLD/ABORT), AES-256-GCM encrypted secrets, composite scoring, sector rotation, Alpaca paper trading, and Discord notifications.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/motion-scanner run dev` — run the frontend (port 23523)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `ENCRYPTION_SECRET` (auto-generated 32-byte hex key)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 at `/api`
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Frontend: React + Vite + Wouter + TanStack Query + shadcn/ui (dark terminal aesthetic)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth for all API contracts
- `lib/api-client-react/src/generated/` — generated TanStack Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `lib/db/src/schema/` — Drizzle ORM schema (tenants, watchlists, scan-configs, scan-results, audit-logs, api-keys)
- `artifacts/api-server/src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt using ENCRYPTION_SECRET
- `artifacts/api-server/src/lib/audit.ts` — SOC 2 audit logging helper
- `artifacts/api-server/src/lib/scanner.ts` — full scanning engine (RSI, EMA, ADX, volume, Monte Carlo, composite scoring)
- `artifacts/api-server/src/middlewares/tenant.ts` — multi-tenant middleware (reads x-clerk-org-id header, falls back to demo-org)
- `artifacts/api-server/src/routes/` — scan, watchlists, config, broker, sector, audit, apikeys
- `artifacts/motion-scanner/src/pages/` — Dashboard, Scanner, SectorRotation, Watchlists, Broker, History, AuditLogs, Settings

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives all codegen; never write types by hand for API shapes.
- **Multi-tenant via header**: `x-clerk-org-id` header sets tenant context; dev fallback is `demo-org`.
- **AES-256-GCM encryption**: All broker API keys encrypted at rest using `ENCRYPTION_SECRET` env var — never stored plaintext.
- **SOC 2 audit trail**: Every mutation is recorded to `audit_logs` with action, user, IP, and metadata.
- **Sector data**: Yahoo Finance public API (no key needed), 5-min in-memory cache in `routes/sector.ts`.

## Product

- **Dashboard**: Portfolio overview — total scans, average GO count, average score, top tickers, recent activity.
- **Scanner**: Run scans on arbitrary tickers or saved watchlists. See tri-state results (GO/HOLD/ABORT) with RSI, ADX, volume ratio per ticker.
- **Sector Rotation**: Live sector leadership/laggard classification from Yahoo Finance. Regime detection (RISK_ON/RISK_OFF/NEUTRAL).
- **Watchlists**: Create/edit/delete named ticker lists for reuse in scans.
- **Broker**: Alpaca paper trading — account summary, open positions, P&L, trade execution.
- **History**: Paginated scan history with drill-down into individual scan results.
- **Audit Logs**: SOC 2-aligned tamper-evident log of all tenant actions.
- **Settings**: Scan thresholds, Monte Carlo toggle, Discord webhook, Alpaca API key management (AES-256-GCM encrypted).

## User preferences

- **Git push / branch convention (ALWAYS):** Every push must go on a branch whose name includes the **date** and a short **what-changed** note (methodical notes as the branch name), e.g. `2026-06-03-expand-majors-universe`. That branch must always be a full merge of the **latest** version of the project (no loss of functionality) before/when it lands. `main` remains the deploy source for Render (auto-deploys on push to `main`), so the date-named branch is merged into `main` to ship to the live user-facing URL.
- Always work methodically: self-reflect, plan, execute, observe, verify (build/logs/browser), and do a plan-vs-execution review. Report only what was actually observed/tested — never claim unverified success.

## Gotchas

- Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck` when DB schema changes — libs must rebuild first.
- After editing `openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks/schemas.
- `ENCRYPTION_SECRET` must be a 32-byte hex string. Changing it will break decryption of existing stored API keys.
- SelectItem values cannot be empty strings in Radix UI — use sentinel values like `"none"`.
- The global proxy routes `/api` to the API server (port 8080) and `/` to the frontend (port 23523).

## Deployment (Render.com)

- Deployed to Render at `https://motion-scanner-v3.onrender.com` (single Docker service; GitHub repo `paisabrazilfl-cpu/motion-scanner-v3`, auto-deploys on push to `main`).
- **Auth on the Render domain uses an EXTERNAL Clerk DEV instance** (not Replit-managed Clerk, which can't serve `*.onrender.com`). Dev instances are origin-permissive and need no DNS/CNAME.
- Required Render env vars: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (+ `DATABASE_URL`, `ENCRYPTION_SECRET`).
- `VITE_CLERK_PUBLISHABLE_KEY` is baked into the frontend bundle at **build time** — the `Dockerfile` passes it as a build ARG so it compiles into the bundle.
- Direct mode only: do **not** set `VITE_CLERK_PROXY_URL`. The Clerk proxy middleware targets `frontend-api.clerk.dev` (production instances only) and does not work for dev instances.
- See `.agents/memory/clerk-dev-deploy-verification.md` for the full rationale and how to verify the deployed page actually renders (Firecrawl screenshots show a false-blank for Clerk dev instances — verify with a real browser).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
