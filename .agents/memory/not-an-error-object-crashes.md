---
name: "not an error object" runtime crashes
description: Why Vite/Replit apps crash with empty-stack "not an error object" overlays and how to mitigate
---

# "An uncaught exception occured but the error was not an error object"

This Replit dev runtime-error overlay message (empty stack, message "(unknown
runtime error)") means a window `error` / `unhandledrejection` event fired with a
payload that is NOT an `Error` instance.

**Common sources (NOT actionable from the stack):**
- Cross-origin script errors — browsers sanitize third-party CDN script failures
  (e.g. Clerk) to `event.error === null` / "Script error." with no stack.
- Libraries throwing primitives from async internals (RAF render loops, event
  callbacks) that escape React error boundaries AND any local try/catch around
  the call site.

**Why try/catch around the call site isn't enough:** the throw often happens
later, asynchronously, inside the library's own render frame — not during your
synchronous `setData`/`addSeries` call.

**Mitigation:** a global capture-phase `window` guard that suppresses ONLY
non-Error payloads (`!(event.error instanceof Error)` / `!(event.reason instanceof
Error)`) via `preventDefault()` + `stopImmediatePropagation()`, logging to
console instead. Real bugs throw `Error` objects and are left untouched, so this
never hides debuggable errors. Make it idempotent across HMR with a `window`
sentinel flag (the module re-runs on hot-replace, but `window` persists).

**Why:** lightweight-charts v5 actually throws real `Error` objects (via
`assert`), so the non-Error signature usually points at cross-origin/Clerk
scripts, not the chart lib — narrowing the guard to chart-specific message
patterns would miss the real source. Blanket non-Error suppression is correct
here because such payloads are inactionable regardless of origin.

**How to apply:** in `motion-scanner`, see `src/lib/chart-error-guard.ts`
installed from `src/main.tsx` before render. Chart components (`charts.tsx`,
`TickerChart.tsx`) also wrap their createChart/series/setData effects in
try/catch as defense-in-depth for the synchronous paths.
