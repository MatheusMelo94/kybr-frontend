import { expect, test, type Page } from "@playwright/test";

import {
  alertScenario,
  seedAlerts,
  setAlertClock,
} from "../fixtures/alerts-mock.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  callsFor,
  createAccount,
  horizontalOverflow,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T125: offline (AC 51, G6), the phone layout (AC 51, 74), and the
// accessibility pass on every Monitoramento state (AC 69, 70, 71, 76), at
// 1280 (panel-desktop) and on the phone projects (360, 768).

const SENTINEL = "MSG-BACKEND-NAO-EXIBIR";
const OFFLINE_ACTIONS = "As decisões voltam quando a internet voltar.";
const NOW = "2026-10-07T15:00:00.000Z";

const main = (page: Page) => page.locator("main");
const banner = (page: Page) =>
  main(page).getByText(/^Sem conexão\. Mostrando os dados de \d{2}:\d{2}\.$/);
const decidir = (page: Page) =>
  main(page).getByRole("link", { name: "Decidir", exact: true });

async function signedIn(
  page: Page,
  request: Parameters<typeof seedAlerts>[0],
  email: string,
  preset: Parameters<typeof seedAlerts>[2],
): Promise<void> {
  await createAccount(request, email);
  await setAlertClock(request, email, NOW);
  await seedAlerts(request, email, preset);
  await logIn(page, email);
}

/** AC 67, 69 (axe, light and dark), 71, 74 (320 px and 200 % text), 76. */
async function crossCutting(page: Page, label: string): Promise<void> {
  await expect(main(page).getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    await page.locator("body").innerText(),
    `${label}: AC 67`,
  ).not.toContain(SENTINEL);
  await expectNoAxeViolations(page);
  const dots = await main(page).evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>(".rounded-full.size-2")]
      .filter((dot) => dot.getAttribute("aria-hidden") !== "true")
      .map((dot) => dot.outerHTML.slice(0, 60)),
  );
  expect(dots, `${label}: AC 71`).toEqual([]);
  const notTabular = await main(page).evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>("time, [data-mon-empty] p")]
      .filter((el) => el.getClientRects().length > 0)
      .filter(
        (el) =>
          !getComputedStyle(el).fontVariantNumeric.includes("tabular-nums"),
      )
      .map((el) => el.textContent?.slice(0, 40)),
  );
  expect(notTabular, `${label}: AC 76`).toEqual([]);

  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  for (const [width, scale] of [
    [320, "100%"],
    [viewport.width, "200%"],
  ] as const) {
    await page.setViewportSize({ width, height: viewport.height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, scale);
    expect(
      await horizontalOverflow(page),
      `${label}: AC 74 at ${width}px, ${scale} text`,
    ).toBeLessThanOrEqual(0);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize(viewport);
}

test.describe("Monitoramento offline, phone and accessibility (T125) @feature-ops-panel @panel-alertas @panel-phone", () => {
  test("offline: offline.panel, Decidir aria-disabled beside offline.actions, no navigation; reconnect re-reads once with offline.back", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const email = uniqueEmail("mon-offline", testInfo);
    await signedIn(page, request, email, "pm1");
    await page.goto("/monitoramento");
    await expect(decidir(page)).toHaveCount(1);

    await context.setOffline(true);
    await expect(banner(page)).toBeVisible();
    await expect(decidir(page)).toHaveAttribute("aria-disabled", "true");
    await expect(decidir(page)).toHaveAccessibleDescription(OFFLINE_ACTIONS);
    await expect(main(page).getByText(OFFLINE_ACTIONS)).toBeVisible();
    await decidir(page).click({ force: true });
    await expect(page).toHaveURL(/\/monitoramento$/);
    await expect(banner(page)).toBeVisible();

    const before = (await callsFor(request, email)).length;
    await context.setOffline(false);
    await expect(
      page.getByRole("status").filter({
        hasText: "Conexão de volta. Dados atualizados.",
      }),
    ).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await expect(decidir(page)).not.toHaveAttribute("aria-disabled");
    await expect
      .poll(
        async () =>
          (await callsFor(request, email))
            .slice(before)
            .filter((call) => call.path.startsWith("/v1/alerts")).length,
      )
      .toBeGreaterThanOrEqual(1);
  });

  test("offline on the unmonitored state: Verificar em lote is disabled the same way", async ({
    page,
    context,
    request,
  }, testInfo) => {
    await signedIn(
      page,
      request,
      uniqueEmail("mon-offline-vazio", testInfo),
      "vazio",
    );
    await page.goto("/monitoramento");
    await context.setOffline(true);
    const cta = main(page).getByRole("link", { name: "Verificar em lote" });
    await expect(cta).toHaveAttribute("aria-disabled", "true");
    await expect(cta).toHaveAccessibleDescription(OFFLINE_ACTIONS);
    await cta.click({ force: true });
    await expect(page).toHaveURL(/\/monitoramento$/);
    await context.setOffline(false);
  });

  test("below lg: rows stack (severity, sentence, when, action); Decidir is a 44 px target on coarse pointers; tapping it opens the case", async ({
    page,
    request,
  }, testInfo) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1024, "the phone layout");
    const email = uniqueEmail("mon-phone", testInfo);
    await signedIn(page, request, email, "um-critico");
    await page.goto("/monitoramento");

    const row = main(page).getByRole("article").first();
    const boxes = await Promise.all(
      [
        row.getByText("Crítico", { exact: true }),
        row.getByText(/ficou inapta na Receita\.$/),
        row.locator("time"),
        row.getByRole("link", { name: "Decidir", exact: true }),
      ].map((part) => part.boundingBox()),
    );
    const tops = boxes.map((box) => box?.y ?? 0);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops).size).toBe(4);

    const coarse = await page.evaluate(
      () => matchMedia("(pointer: coarse)").matches,
    );
    const target = boxes[3];
    expect(target?.height ?? 0).toBeGreaterThanOrEqual(coarse ? 44 : 40);
    expect(target?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await decidir(page).tap();
    await page.waitForURL(/\/fila\/[^/?]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("every state: success, the three empty states, error, partial and offline", async ({
    page,
    context,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    const email = uniqueEmail("mon-a11y", testInfo);
    await signedIn(page, request, email, "pm1");
    await page.goto("/monitoramento");
    await crossCutting(page, "success");

    await context.setOffline(true);
    await expect(banner(page)).toBeVisible();
    await crossCutting(page, "offline");
    await context.setOffline(false);
    await expect(banner(page)).toHaveCount(0);

    await alertScenario(request, email, "monitoramento-falha");
    await page.goto("/monitoramento");
    await expect(main(page).getByRole("article")).toHaveCount(7);
    await crossCutting(page, "partial (pill hidden)");
    await alertScenario(request, email, "monitoramento-falha", false);

    for (const preset of ["vazio", "semvarredura", "semalertas"] as const) {
      await seedAlerts(request, email, preset);
      await page.goto("/monitoramento");
      await expect(main(page).locator("[data-mon-empty]")).toBeVisible();
      await crossCutting(page, `empty ${preset}`);
    }

    await alertScenario(request, email, "alertas-falha");
    await page.goto("/monitoramento");
    const error = main(page).getByRole("alert");
    await expect(error).toBeVisible();
    // The boundary has no h1 of its own: axe and AC 74 on it as it is.
    expect(await page.locator("body").innerText()).not.toContain(SENTINEL);
    await expectNoAxeViolations(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await alertScenario(request, email, "alertas-falha", false);
  });
});

test.describe("Monitoramento keyboard at 1280 (T125) @feature-ops-panel @panel-alertas", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "the sidebar path",
  );

  const focused = (page: Page) =>
    page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body)
        return { name: "", ring: false, inMain: false };
      const style = getComputedStyle(element);
      return {
        name: (element.innerText ?? "").trim().split("\n")[0] ?? "",
        ring: style.outlineStyle !== "none" || style.boxShadow !== "none",
        inMain: element.closest("main") !== null,
      };
    });

  async function tabsInMain(page: Page): Promise<string[]> {
    await page.keyboard.press("Tab");
    expect((await focused(page)).name).toBe("Pular para o conteúdo");
    await page.keyboard.press("Enter");
    const seen: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press("Tab");
      const now = await focused(page);
      if (!now.inMain) break;
      expect(now.ring, `focus ring on ${now.name}`).toBe(true);
      seen.push(now.name);
    }
    return seen;
  }

  test("skip link → each Decidir, in list order; visible focus; no trap", async ({
    page,
    request,
  }, testInfo) => {
    await signedIn(page, request, uniqueEmail("mon-kbd", testInfo), "pm1");
    await page.goto("/monitoramento");
    await expect(decidir(page)).toHaveCount(1);
    expect(await tabsInMain(page)).toEqual(["Decidir"]);
  });

  test("empty: skip link → Verificar em lote", async ({
    page,
    request,
  }, testInfo) => {
    await signedIn(
      page,
      request,
      uniqueEmail("mon-kbd-vazio", testInfo),
      "vazio",
    );
    await page.goto("/monitoramento");
    await expect(main(page).locator("[data-mon-empty]")).toBeVisible();
    expect(await tabsInMain(page)).toEqual(["Verificar em lote"]);
  });
});
