import type { Page } from "@playwright/test";

/** Records when each status check (a Server Action POST) leaves the page. */
export function recordChecks(page: Page): number[] {
  const sent: number[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"])
      sent.push(Date.now());
  });
  return sent;
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
