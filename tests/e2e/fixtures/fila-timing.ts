import type { Page } from "@playwright/test";

import { REFRESH_SETTLE_MS } from "../../../lib/navigation/refresh-timing.ts";

// P6-005: the Fila specs' timing helpers.

/**
 * For a state that rides the refresh workaround (a re-read, a soft
 * navigation, a retry that refreshes until replaced): every refresh may be
 * dropped and the full load follows, so the wait gets that budget, not the
 * default 5 s.
 */
export const SETTLE = { timeout: REFRESH_SETTLE_MS };

/**
 * Holds the next Server Action POST whose body carries `match` (the case
 * id; polls pass through) in the browser until the returned release() runs:
 * a deterministic "in flight" window instead of a timed decide-lento. The
 * action reaches the server, and so the API, only once released.
 */
export async function holdNextAction(
  page: Page,
  match: string,
): Promise<() => void> {
  let release!: () => void;
  const released = new Promise<void>((done) => {
    release = done;
  });
  let held = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      held ||
      request.method() !== "POST" ||
      request.headers()["next-action"] === undefined ||
      !(request.postData() ?? "").includes(match)
    )
      return route.fallback();
    held = true;
    await released;
    await route.fallback();
  });
  return release;
}

/** Two animation frames: whatever React does after an event has committed. */
export async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
}
