import type { Instrumentation } from "next";

// Runs once when a server instance boots (Next.js instrumentation hook).
// The standalone server serializes next.config.ts, so its build-time env check
// doesn't run again at container start. Importing lib/env here validates the
// environment at boot (threat model F09).
//
// It also starts server-side monitoring (T34a). Node.js only: the edge
// (middleware) and the browser get no Sentry code. There's deliberately no
// instrumentation-client.ts (no browser SDK on /v/*, ADR-0003).
export async function register(): Promise<void> {
  let env: { SENTRY_DSN?: string | undefined };
  try {
    ({ env } = await import("@/lib/env"));
  } catch (error) {
    // Next only logs a failed hook and keeps serving, so a bad env would fail
    // every request instead of the boot. Exit instead, so the deploy fails.
    // NEXT_RUNTIME is set by Next itself (the documented instrumentation
    // pattern), not app config, and the edge build drops this branch.
    if (process.env.NEXT_RUNTIME === "nodejs") {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
    throw error;
  }
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initMonitoring } = await import("@/lib/monitoring");
    initMonitoring(env.SENTRY_DSN);
  }
}

/** Server render, route and action errors, to Sentry (scrubbed by lib/monitoring). */
export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
};
