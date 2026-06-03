---
name: Clerk dev deploy + screenshot false-negative
description: How to make Clerk auth work on non-Replit deploy domains (e.g. onrender.com) and how to verify the page actually renders.
---

## Clerk auth on a non-Replit deploy domain (e.g. *.onrender.com)

- Replit-managed Clerk **cannot** serve an arbitrary deploy domain like `*.onrender.com`. For such domains use an **external Clerk DEV instance** (the user's own Clerk app, `pk_test_…`/`sk_test_…`).
- A Clerk **DEV** instance is origin-permissive: its full handshake works from any origin with **no DNS/CNAME**. Verified by curling the FAPI from the deploy origin:
  - `POST  https://<fapi>/v1/dev_browser` → 200 + dev-browser token
  - `GET   https://<fapi>/v1/environment?...&__clerk_db_jwt=<token>` → 200
  - `GET   https://<fapi>/v1/client?...&__clerk_db_jwt=<token>` → 200
  A raw curl to `/v1/environment` **without** the dev-browser token returns `401 dev_browser_unauthenticated` — that is NORMAL, not a failure.
- A Clerk **PRODUCTION** instance needs a CNAME (can't do on a free onrender subdomain). The repo's Clerk proxy middleware targets `frontend-api.clerk.dev` (prod only) and does NOT work for dev instances → for dev instances use DIRECT mode: do **not** set `VITE_CLERK_PROXY_URL`.
- The frontend bakes `VITE_CLERK_PUBLISHABLE_KEY` at **build time** (Vite). For Docker/Render builds, pass it as a build ARG so it's compiled into the bundle; a runtime env var alone won't reach the client bundle.
- `publishableKeyFromHost(host, fallback)` (from `@clerk/react/internal` / `@clerk/shared/keys`) returns the `fallback` key for **every** host (localhost, *.replit.dev, *.onrender.com, even ""). It is NOT host-restricted, so the `if (!clerkPubKey) throw` guard will not fire merely because the host is unrecognized.

## Verifying a deployed SPA actually renders — screenshot false negatives

- **`external_url` / Firecrawl screenshots produce a false-blank for SPAs gated behind a Clerk DEV instance.** Clerk's async dev-browser handshake doesn't complete in the headless screenshotter, so `<Show when="signed-out">` renders nothing and you see only the dark background. This is a tooling artifact, NOT a real bug.
- **Why:** the app renders neither signed-in nor signed-out content until Clerk finishes loading; the screenshotter captures before/without the handshake.
- **How to apply:** before concluding a deployed page is broken from a blank screenshot, get a REAL browser. The `testing` skill's `runTest()` drives real Playwright and can navigate to an **absolute external URL** (pass the full `https://…` deploy URL in the test plan) — it returns the rendered state + verbatim console logs. That confirmed the Render sign-in renders fine while Firecrawl showed blank.
