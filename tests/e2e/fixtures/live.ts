import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page, Request } from "@playwright/test";

import { serverActionId } from "../../fixtures/server-actions.ts";

let checkActionId: string | undefined;

/**
 * pollCaseViewAction's id in the build the specs run against. Read on first
 * use: Playwright lists the specs before its webServer builds the app.
 */
function checkId(): string {
  checkActionId ??= serverActionId(
    JSON.parse(
      readFileSync(
        join(process.cwd(), ".next/server/server-reference-manifest.json"),
        "utf8",
      ),
    ),
    "features/seller-link/actions.ts",
    "pollCaseViewAction",
  );
  return checkActionId;
}

/**
 * A status check is a pollCaseViewAction POST, recognised by its Server
 * Action id (review 0019), whatever its arguments. The e-mail save
 * (saveContactEmail) is a Server Action POST too, with another id, so it never
 * counts (QA M3 G10).
 */
export function isCheck(request: Request): boolean {
  return (
    request.method() === "POST" &&
    request.headers()["next-action"] === checkId()
  );
}

export type CheckLog = {
  /** When each status check (a Server Action POST) left the page. */
  sent: number[];
  /** When each one's response came back (or the request failed). */
  settled: number[];
};

/** Records the page's status checks as they're sent and as they settle. */
export function recordChecks(page: Page): CheckLog {
  const log: CheckLog = { sent: [], settled: [] };
  page.on("request", (request) => {
    if (isCheck(request)) log.sent.push(Date.now());
  });
  const settle = (request: Request): void => {
    if (isCheck(request)) log.settled.push(Date.now());
  };
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  return log;
}

/** A page clock installed at a start the test set (review 0018). */
export type TestClock = { start: number; installedAt: number };

/** Installs the page clock at a start the test sets: now, on the test's side. */
export async function installClock(page: Page): Promise<TestClock> {
  const start = Date.now();
  await page.clock.install({ time: start });
  return { start, installedAt: start };
}

/**
 * Pauses the page clock just ahead of where it is (review 0018). The clock
 * runs in real time from the start the test set, so its time is known here
 * without a round trip to the page; under load the pause can still land in the
 * past, so it retries with a wider margin. The first margin stays small:
 * cadence tests count from the pause with 300 ms of slack.
 */
export async function pauseClock(page: Page, clock: TestClock): Promise<void> {
  for (const margin of [100, 500, 1_000]) {
    const target = clock.start + (Date.now() - clock.installedAt) + margin;
    try {
      await page.clock.pauseAt(target);
      return;
    } catch (error) {
      if (margin === 1_000 || !String(error).includes("past")) throw error;
    }
  }
}

/** Resolves when the page sends its next status check. */
export function nextCheck(page: Page, timeout = 3_000): Promise<unknown> {
  return page.waitForRequest(isCheck, { timeout });
}

/** Marks the document; the mark survives only if it's never reloaded. */
export async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
}

/** True while the document marked by markDocument() is still the one shown. */
export async function isSameDocument(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as unknown as { __sameDocument?: boolean }).__sameDocument ===
      true,
  );
}
