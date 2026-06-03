// Some runtime crashes surface as an "uncaught exception that was NOT an error
// object" — the browser fires a window `error` / `unhandledrejection` event whose
// payload is not an `Error` instance. Two common sources in this app:
//   1. Cross-origin script errors (e.g. third-party CDN scripts such as Clerk):
//      the browser sanitizes these to `event.error === null` / "Script error."
//      for security, so they carry NO actionable stack or message.
//   2. Libraries (charting/render loops) that throw primitives from async
//      internals (requestAnimationFrame, event callbacks), escaping both React
//      error boundaries and any local try/catch around the call site.
// In dev these crash the app via Replit's runtime-error overlay even though they
// are inactionable.
//
// This guard intercepts those window-level events when the payload is NOT a real
// `Error` and stops them from propagating to the overlay, logging them to the
// console instead. Genuine application bugs throw real `Error` objects and are
// left completely untouched, so this never hides actionable, debuggable errors.
//
// Registered in the capture phase as a best effort to run before the overlay's
// own listener (capture-phase listeners fire before bubble-phase ones on the same
// target). This is not a hard guarantee of ordering, but covers the common case.

const SENTINEL = "__motionScannerChartErrorGuardInstalled";

export function installChartErrorGuard(): void {
  if (typeof window === "undefined") return;
  // Idempotent across Vite HMR / StrictMode re-runs: the flag lives on `window`,
  // which persists when this module is hot-replaced.
  if ((window as unknown as Record<string, boolean>)[SENTINEL]) return;
  (window as unknown as Record<string, boolean>)[SENTINEL] = true;

  window.addEventListener(
    "error",
    (event: ErrorEvent) => {
      // A real Error was thrown — let it surface so the bug is visible.
      if (event.error instanceof Error) return;
      // Non-Error throw or cross-origin "Script error." (event.error == null).
      event.preventDefault();
      event.stopImmediatePropagation();
      // eslint-disable-next-line no-console
      console.warn("[chart-error-guard] suppressed non-Error window error:", event.message || event.error);
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) => {
      if (event.reason instanceof Error) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      // eslint-disable-next-line no-console
      console.warn("[chart-error-guard] suppressed non-Error promise rejection:", event.reason);
    },
    true,
  );
}
