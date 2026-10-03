import type { Page, Request } from "@playwright/test";

function isCheck(request: Request): boolean {
  return request.method() === "POST" && !!request.headers()["next-action"];
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

/** Resolves when the page sends its next status check. */
export function nextCheck(page: Page, timeout = 3_000): Promise<unknown> {
  return page.waitForRequest(
    (request) =>
      request.method() === "POST" && !!request.headers()["next-action"],
    { timeout },
  );
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
