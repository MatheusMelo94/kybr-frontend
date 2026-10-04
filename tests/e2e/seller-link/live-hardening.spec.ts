import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Request,
  type Route,
} from "@playwright/test";

import { MEI_CNPJS, SLUGS } from "../../fixtures/factories/seller-link.ts";
import { installClock, isCheck, pauseClock } from "../fixtures/live.ts";
import { createCase, setCaseState } from "../fixtures/mock-api.ts";

// QA-M2-004 (T35): the case-page behaviors QA verified only in its M2
// scratchpad, ported in QA's priority order: the F12 MEI CPF payload scan,
// rule 10 (a 429/5xx HTML answer is silent back-off, never "offline"), Q4
// (never back to verificando) and the em análise ladder's 2 h stop.
//
// The clock cases run on chromium-desktop only: the timers are
// engine-independent and the runs are long. Never reload or navigate while
// page.clock is paused (React's streaming reveal runs on faked timers).

const VERIFYING = "Verificando sua empresa";
const ANALYSIS = "Sua empresa está em análise";
const BANNER = "Sem conexão. Assim que a internet voltar, continuamos daqui.";

const h1 = (page: Page, name: string | RegExp) =>
  page.getByRole("heading", { level: 1, name });

type Log = { checks: number; settled: number; rsc: number };

/** Counts status checks (not the e-mail save, G10), their settling, and the case page's RSC refreshes. */
function record(page: Page): Log {
  const log: Log = { checks: 0, settled: 0, rsc: 0 };
  const settle = (request: Request): void => {
    if (isCheck(request)) log.settled += 1;
  };
  page.on("request", (request) => {
    if (isCheck(request)) log.checks += 1;
    // A refresh of the case page itself; the privacy link's prefetch doesn't count.
    if (
      request.method() === "GET" &&
      (request.headers()["rsc"] === "1" || request.url().includes("_rsc=")) &&
      /\/c\/[^/?]+(\?|$)/.test(request.url())
    )
      log.rsc += 1;
  });
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  return log;
}

/** Lets a test flip document.hidden and fire visibilitychange. */
async function installVisibility(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (hidden ? "hidden" : "visible"),
    });
    (window as unknown as { __setHidden: (h: boolean) => void }).__setHidden = (
      h,
    ) => {
      hidden = h;
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
}

async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate(
    (h) =>
      (window as unknown as { __setHidden: (h: boolean) => void }).__setHidden(
        h,
      ),
    hidden,
  );
}

/** Opens a case under an installed clock, then pauses it just after mount. */
async function openPaused(
  page: Page,
  request: APIRequestContext,
  input: Parameters<typeof createCase>[1],
  heading: string,
): Promise<{ token: string; log: Log }> {
  const token = await createCase(request, input);
  const log = record(page);
  const clock = await installClock(page);
  await page.goto(`/v/${SLUGS.ok}/c/${token}`);
  await expect(h1(page, heading)).toBeVisible();
  await pauseClock(page, clock);
  await expect.poll(() => log.settled).toBe(log.checks);
  return { token, log };
}

/**
 * Advances the paused clock, lets any check it started settle, and returns how
 * many started. A check the run started leaves the page asynchronously, so it
 * returns as soon as one is seen, or after `quiet` ms with none (review 0026).
 */
async function step(
  page: Page,
  log: Log,
  ms: number,
  quiet = 2_000,
): Promise<number> {
  const before = log.checks;
  await page.clock.runFor(ms);
  await expect
    .poll(() => log.checks, { timeout: quiet })
    .toBeGreaterThan(before)
    .catch(() => {});
  await expect.poll(() => log.settled, { timeout: 5_000 }).toBe(log.checks);
  return log.checks - before;
}

/** The next check comes exactly `gap` ms after the last one. */
async function expectGap(
  page: Page,
  log: Log,
  gap: number,
  label: string,
): Promise<void> {
  // A short quiet window (twice the old fixed sleep) keeps the 169-gap ladder
  // fast; the on-time step waits as long as a check takes to show up.
  expect(await step(page, log, gap - 1, 300), `${label}: early`).toBe(0);
  expect(await step(page, log, 1), `${label}: on time`).toBe(1);
}

test.describe("live status hardening (QA-M2-004) @feature-seller-link", () => {
  test("F12: an MEI name is masked on every case screen and never in the HTML, RSC or check payloads", async ({
    page,
    request,
  }) => {
    for (const kind of ["aprovado", "pendente", "bloqueado"] as const) {
      const token = await createCase(request, {
        kind,
        cnpj: MEI_CNPJS.unmasked,
        ageMs: 60_000,
      });
      const html = await (
        await request.get(`/v/${SLUGS.ok}/c/${token}`)
      ).text();
      expect(html).not.toMatch(/12345678909|123\.456\.789-09/);
      expect(html).toContain("***.***.***-**");

      await page.goto(`/v/${SLUGS.ok}/c/${token}`);
      const main = page.locator("main");
      await expect(main).toContainText("JOAO CARLOS SILVA");
      await expect(main).not.toContainText(/12345678909|123\.456\.789-09/);
      await expect(
        main.locator('[aria-hidden="true"]', { hasText: "***.***.***-**" }),
      ).not.toHaveCount(0);
      await expect(main).toContainText("CPF oculto");
    }

    // A live arrival: every check response and RSC refresh, too.
    const live = await createCase(request, { cnpj: MEI_CNPJS.unmasked });
    const payloads: Promise<string>[] = [];
    page.on("response", (response) => {
      const sent = response.request();
      if (sent.method() === "POST" || sent.headers()["rsc"] === "1")
        payloads.push(response.text().catch(() => ""));
    });
    await page.goto(`/v/${SLUGS.ok}/c/${live}`);
    await expect(h1(page, VERIFYING)).toBeVisible();
    await setCaseState(request, live, { kind: "aprovado" });
    await expect(h1(page, /^Tudo certo/)).toBeVisible({ timeout: 8_000 });
    await page.waitForLoadState("networkidle");

    const bodies = await Promise.all(payloads);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies)
      expect(body).not.toMatch(/12345678909|123\.456\.789-09/);
  });

  test.describe("on a paused clock", () => {
    test.beforeEach(({}, testInfo) => {
      test.skip(
        testInfo.project.name !== "chromium-desktop",
        "clock runs: one engine",
      );
    });

    for (const status of [429, 503]) {
      test(`rule 10: a ${status} HTML answer to a check is silent back-off (5/10/20 s), never the offline banner`, async ({
        page,
        request,
      }) => {
        test.setTimeout(120_000);
        const { token, log } = await openPaused(page, request, {}, VERIFYING);
        const reject = async (route: Route): Promise<void> => {
          if (isCheck(route.request()))
            await route.fulfill({
              status,
              contentType: "text/html",
              body: "<html><body>Too Many Requests</body></html>",
            });
          else await route.continue();
        };
        await page.route(`**/c/${token}`, reject);

        expect(await step(page, log, 2_000)).toBe(1);
        await expectGap(page, log, 5_000, "back-off 5 s");
        await expectGap(page, log, 10_000, "back-off 10 s");
        await expectGap(page, log, 20_000, "back-off 20 s");
        await expect(page.getByText(BANNER)).toHaveCount(0);
        expect(await page.evaluate(() => location.pathname)).toContain(token);

        await page.unroute(`**/c/${token}`, reject);
        await expectGap(page, log, 40_000, "back-off 40 s (answers)");
        await expectGap(page, log, 10_000, "back to the em análise band");
        await expect(page.getByText(BANNER)).toHaveCount(0);
      });
    }

    test("Q4: after the 10 s switch, the server still saying verificando is no change: never back", async ({
      page,
      request,
    }) => {
      const { log } = await openPaused(page, request, {}, VERIFYING);
      for (let i = 0; i < 5; i += 1) await step(page, log, 2_000);
      // em análise carries the e-mail block, a lazy chunk: once it has loaded,
      // React commits the view on a timer, which the paused clock must run.
      // The 10 s check can land on either side of the last step's edge.
      await page.waitForLoadState("networkidle");
      expect(await step(page, log, 500)).toBeLessThanOrEqual(1);

      await expect(h1(page, ANALYSIS)).toBeFocused();
      // Then em análise's 10 s band, not verificando's 2 s cadence.
      expect(await step(page, log, 8_000), "ladder: early").toBe(0);
      expect(await step(page, log, 2_000), "ladder: on time").toBe(1);
      await expectGap(page, log, 10_000, "ladder");
      await expect(h1(page, ANALYSIS)).toBeVisible();
      await expect(page.getByText(VERIFYING)).toHaveCount(0);
      expect(log.rsc).toBe(0);
    });

    test("rule 9: the em análise ladder (10 s, 30 s, 60 s) stops at 2 h and stays silent; visible restarts it, and a later result still arrives", async ({
      page,
      request,
      context,
    }) => {
      test.setTimeout(600_000);
      await installVisibility(page);
      const { token, log } = await openPaused(
        page,
        request,
        { ageMs: 11_000 },
        ANALYSIS,
      );

      // First check about 10 s after mount, then the bands to the 2 h stop.
      expect(await step(page, log, 9_700)).toBe(0);
      expect(await step(page, log, 400)).toBe(1);
      for (let i = 2; i <= 30; i += 1)
        await expectGap(page, log, 10_000, `10 s #${i}`);
      for (let i = 1; i <= 50; i += 1)
        await expectGap(page, log, 30_000, `30 s #${i}`);
      for (let i = 1; i <= 89; i += 1)
        await expectGap(page, log, 60_000, `60 s #${i}`);
      expect(log.checks).toBe(169);

      // Stopped: an hour of silence, no banner, the view unchanged.
      expect(await step(page, log, 60 * 60_000)).toBe(0);
      await expect(page.getByText(BANNER)).toHaveCount(0);
      await expect(h1(page, ANALYSIS)).toBeVisible();

      // Hidden, then visible: the ladder restarts from its first band.
      await setHidden(page, true);
      await setHidden(page, false);
      await expect.poll(() => log.checks).toBe(170);
      await expect.poll(() => log.settled).toBe(170);
      await expectGap(page, log, 10_000, "restart 10 s");

      // The restarted ladder still finds a result (offline/online on the way).
      await setCaseState(request, token, { kind: "aprovado" });
      await context.setOffline(true);
      await context.setOffline(false);
      await page.clock.resume();
      await expect(h1(page, /^Tudo certo/)).toBeVisible({ timeout: 15_000 });
    });
  });
});
