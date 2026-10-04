import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Route,
} from "@playwright/test";

import { MEI_CNPJS, SLUGS } from "../../fixtures/factories/seller-link.ts";
import {
  checksInPage,
  countChecksInPage,
  flushTasks,
  installClock,
  isCheck,
  pageTime,
  pauseClock,
  waitForHydration,
} from "../fixtures/live.ts";
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

type Log = { rsc: number };

/**
 * Counts status checks in the page (countChecksInPage: exact, no real-time
 * window; review 0029), and the case page's RSC refreshes here.
 */
async function record(page: Page): Promise<Log> {
  await countChecksInPage(page);
  const log: Log = { rsc: 0 };
  page.on("request", (request) => {
    // A refresh of the case page itself; the privacy link's prefetch doesn't count.
    if (
      request.method() === "GET" &&
      (request.headers()["rsc"] === "1" || request.url().includes("_rsc=")) &&
      /\/c\/[^/?]+(\?|$)/.test(request.url())
    )
      log.rsc += 1;
  });
  return log;
}

/** Status checks the page has sent so far. */
async function sent(page: Page): Promise<number> {
  return (await checksInPage(page)).sent;
}

/** Waits for every check in flight to come back, and for the page to act on it. */
async function settle(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const { sent: out, settled } = await checksInPage(page);
      return settled === out;
    })
    .toBe(true);
  await flushTasks(page);
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

type Opened = {
  token: string;
  log: Log;
  /** Page times: mount happened between navigation and hydration being seen. */
  navigatedAt: number;
  hydratedAt: number;
  pausedAt: number;
};

/** Opens a case under an installed clock, then pauses it once hydrated. */
async function openPaused(
  page: Page,
  request: APIRequestContext,
  input: Parameters<typeof createCase>[1],
  heading: string,
): Promise<Opened> {
  const token = await createCase(request, input);
  const log = await record(page);
  const clock = await installClock(page);
  const navigatedAt = pageTime(clock);
  await page.goto(`/v/${SLUGS.ok}/c/${token}`);
  await expect(h1(page, heading)).toBeVisible();
  await waitForHydration(page);
  const hydratedAt = pageTime(clock);
  const pausedAt = await pauseClock(page, clock);
  await settle(page);
  return { token, log, navigatedAt, hydratedAt, pausedAt };
}

/**
 * Advances the paused clock and returns how many checks that started. A
 * check a timer starts calls fetch during runFor (plus the page's queued
 * tasks), so the count is exact; then it waits for them to settle (review
 * 0029: no real-time window).
 */
async function step(page: Page, ms: number): Promise<number> {
  const before = await sent(page);
  await page.clock.runFor(ms);
  await flushTasks(page);
  const started = (await sent(page)) - before;
  await settle(page);
  return started;
}

/** The next check comes exactly `gap` ms after the last one. */
async function expectGap(
  page: Page,
  gap: number,
  label: string,
): Promise<void> {
  expect(await step(page, gap - 1), `${label}: early`).toBe(0);
  expect(await step(page, 1), `${label}: on time`).toBe(1);
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
      // The case page's own checks and RSC refreshes. Not prefetches of other
      // routes (the privacy footer's link): they hold no case data, and a
      // prefetch body can stay open for ~30 s under load.
      if (
        new URL(sent.url()).pathname.endsWith(`/c/${live}`) &&
        (sent.method() === "POST" || sent.headers()["rsc"] === "1")
      )
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
        const { token } = await openPaused(page, request, {}, VERIFYING);
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

        expect(await step(page, 2_000)).toBe(1);
        await expectGap(page, 5_000, "back-off 5 s");
        await expectGap(page, 10_000, "back-off 10 s");
        await expectGap(page, 20_000, "back-off 20 s");
        await expect(page.getByText(BANNER)).toHaveCount(0);
        expect(await page.evaluate(() => location.pathname)).toContain(token);

        await page.unroute(`**/c/${token}`, reject);
        await expectGap(page, 40_000, "back-off 40 s (answers)");
        await expectGap(page, 10_000, "back to the em análise band");
        await expect(page.getByText(BANNER)).toHaveCount(0);
      });
    }

    test("Q4: after the 10 s switch, the server still saying verificando is no change: never back", async ({
      page,
      request,
    }) => {
      const { log } = await openPaused(page, request, {}, VERIFYING);
      for (let i = 0; i < 5; i += 1) await step(page, 2_000);
      // em análise carries the e-mail block, a lazy chunk: once it has loaded,
      // React commits the view on a timer, which the paused clock must run.
      // The 10 s check can land on either side of the last step's edge.
      await page.waitForLoadState("networkidle");
      expect(await step(page, 500)).toBeLessThanOrEqual(1);

      await expect(h1(page, ANALYSIS)).toBeFocused();
      // Then em análise's 10 s band, not verificando's 2 s cadence.
      expect(await step(page, 8_000), "ladder: early").toBe(0);
      expect(await step(page, 2_000), "ladder: on time").toBe(1);
      await expectGap(page, 10_000, "ladder");
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
      const { token, navigatedAt, hydratedAt, pausedAt } = await openPaused(
        page,
        request,
        { ageMs: 11_000 },
        ANALYSIS,
      );

      // First check 10 s after mount, then the bands to the 2 h stop. Mount
      // was between navigation and hydration being seen (page times), so the
      // check is due in that window, counted from the measured pause.
      const earliest = navigatedAt + 10_000 - pausedAt;
      const latest = hydratedAt + 10_000 - pausedAt;
      expect(await step(page, earliest - 1), "first check: early").toBe(0);
      expect(
        await step(page, latest - earliest + 1),
        "first check: in its window",
      ).toBe(1);
      for (let i = 2; i <= 30; i += 1)
        await expectGap(page, 10_000, `10 s #${i}`);
      for (let i = 1; i <= 50; i += 1)
        await expectGap(page, 30_000, `30 s #${i}`);
      for (let i = 1; i <= 89; i += 1)
        await expectGap(page, 60_000, `60 s #${i}`);
      expect(await sent(page)).toBe(169);

      // Stopped: an hour of silence, no banner, the view unchanged.
      expect(await step(page, 60 * 60_000)).toBe(0);
      await expect(page.getByText(BANNER)).toHaveCount(0);
      await expect(h1(page, ANALYSIS)).toBeVisible();

      // Hidden, then visible: the ladder restarts from its first band.
      await setHidden(page, true);
      await setHidden(page, false);
      await expect.poll(() => sent(page)).toBe(170);
      await settle(page);
      await expectGap(page, 10_000, "restart 10 s");

      // The restarted ladder still finds a result (offline/online on the way).
      await setCaseState(request, token, { kind: "aprovado" });
      await context.setOffline(true);
      await context.setOffline(false);
      await page.clock.resume();
      await expect(h1(page, /^Tudo certo/)).toBeVisible({ timeout: 15_000 });
    });
  });
});
