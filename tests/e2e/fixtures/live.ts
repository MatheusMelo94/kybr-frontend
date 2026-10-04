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

/** The page clock's time now, known on the test's side (it runs in real time from the start). */
export function pageTime(clock: TestClock): number {
  return clock.start + (Date.now() - clock.installedAt);
}

/**
 * Pauses the page clock just ahead of where it is (review 0018) and returns
 * the page time it paused at, so a test can count from it (review 0029).
 * Under load the pause can land in the past, so it retries with a wider
 * margin.
 */
export async function pauseClock(
  page: Page,
  clock: TestClock,
): Promise<number> {
  for (const margin of [100, 500, 1_000]) {
    const target = pageTime(clock) + margin;
    try {
      await page.clock.pauseAt(target);
      return target;
    } catch (error) {
      if (margin === 1_000 || !String(error).includes("past")) throw error;
    }
  }
  throw new Error("unreachable");
}

/**
 * Waits until React has hydrated the case page's client islands: every polite
 * region in <main> (CaseLiveStatus, CaseViewTransition) carries a React fiber.
 * Their effects (the check timer, the online/offline listeners) run right
 * after, so this also flushes the page's pending tasks (review 0029).
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const regions = [...document.querySelectorAll("main [role='status']")];
    return (
      regions.length > 0 &&
      regions.every((region) =>
        Object.keys(region).some((key) => key.startsWith("__reactFiber$")),
      )
    );
  });
  await flushTasks(page);
}

/**
 * Lets the page run the tasks already queued: React's scheduler posts its
 * work through a MessageChannel, which page.clock doesn't fake, so a few
 * round trips through one let a commit and its effects (such as scheduling
 * the next check) finish, even on a paused clock.
 */
export async function flushTasks(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        let turns = 0;
        channel.port1.onmessage = () => {
          turns += 1;
          if (turns < 5) channel.port2.postMessage(0);
          else resolve();
        };
        channel.port2.postMessage(0);
      }),
  );
}

export type PageChecks = { sent: number; settled: number };

/**
 * Counts status checks inside the page (review 0029): a fetch wrapper keyed on
 * pollCaseViewAction's id. A check a timer starts calls fetch during
 * page.clock.runFor, so the count is exact as soon as runFor returns, with no
 * real-time window. `settled` counts a check once its response body is read.
 * Call before page.goto().
 */
export async function countChecksInPage(page: Page): Promise<void> {
  await page.addInitScript((id: string) => {
    const counts = { sent: 0, settled: 0 };
    (window as unknown as { __checks: typeof counts }).__checks = counts;
    const original = window.fetch;
    window.fetch = function (input, init) {
      const check = new Headers(init?.headers).get("next-action") === id;
      if (check) counts.sent += 1;
      const response = original.call(this, input, init);
      if (check) {
        const settle = (): void => {
          counts.settled += 1;
        };
        response
          .then((answer) => answer.clone().arrayBuffer())
          .then(settle, settle);
      }
      return response;
    };
  }, checkId());
}

/** The page's own check counts (countChecksInPage). */
export function checksInPage(page: Page): Promise<PageChecks> {
  return page.evaluate(
    () => (window as unknown as { __checks: PageChecks }).__checks,
  );
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
