// Runs once when a server instance boots (Next.js instrumentation hook).
// The standalone server serializes next.config.ts, so its build-time env check
// doesn't run again at container start. Importing lib/env here validates the
// environment at boot (threat model F09).
export async function register(): Promise<void> {
  try {
    await import("@/lib/env");
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
}
