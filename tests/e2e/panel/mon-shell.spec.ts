import { expect, test, type Page } from "@playwright/test";

import {
  alertFault,
  alertScenario,
  seedAlerts,
} from "../fixtures/alerts-mock.ts";
import {
  createAccount,
  expireSessions,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T122: the Monitoramento nav item and count (S5), the route, header, pill
// and side card (AC 48 pill half, AC 50), loading, error and the session
// redirect.

/** Starts recording layout shifts before anything paints. */
async function recordShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __shift: number };
    w.__shift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!entry.hadRecentInput) w.__shift += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
}

/** Every painted element whose colour, background or border is --color-monitor. */
async function blueElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-monitor)";
    document.body.append(probe);
    const blue = getComputedStyle(probe).color;
    probe.remove();
    const found: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const style = getComputedStyle(el);
      if (el.getClientRects().length === 0) continue;
      if (
        [
          style.color,
          style.backgroundColor,
          style.borderTopColor,
          style.outlineColor,
        ].includes(blue) &&
        // A transparent border inherits currentColor only when it has width.
        !(style.color === blue && el.textContent?.trim() === "")
      )
        found.push(el.className.toString());
    }
    return found;
  });
}

test.describe("Monitoramento route and shell (T122) @feature-ops-panel @panel-alertas", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("nav: Monitoramento after the Fila, with the undecided critical count; the page's header, pill and side card", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("mon-shell", testInfo);
    await createAccount(request, email);
    await seedAlerts(request, email, "pm1");
    await logIn(page, email);

    const nav = page.getByRole("navigation", { name: "Navegação do painel" });
    const names = await nav.getByRole("link").allInnerTexts();
    expect(names.map((name) => name.split("\n")[0])).toEqual([
      "Fila de revisão",
      "Monitoramento",
      "Verificar em lote",
    ]);
    await nav
      .getByRole("link", {
        name: "Monitoramento 1 alerta crítico sem decisão",
      })
      .click();
    await expect(page).toHaveURL(/\/monitoramento$/);

    await expect(
      page.getByRole("heading", { level: 1, name: "Monitoramento" }),
    ).toBeVisible();
    await expect(
      page.getByText(/^Ativo\. Próxima varredura: segunda-feira, 06:00$/),
    ).toBeVisible();
    const card = page.getByRole("region", { name: "Onde avisamos" });
    await expect(
      card.getByText(`Alertas críticos chegam na hora por e-mail em ${email}.`),
    ).toBeVisible();
    await expect(card.locator("input, button, select, textarea")).toHaveCount(
      0,
    );

    // DDR-0003 / AC 48: the pill's dot is the only blue on the page.
    const blue = await blueElements(page);
    expect(blue).toHaveLength(1);
    expect(blue[0]).toContain("bg-monitor");

    // Two columns at lg: the card sits to the right of the alerts.
    const alerts = page.getByRole("heading", { level: 2, name: "Alertas" });
    const [alertsBox, cardBox] = [
      await alerts.boundingBox(),
      await card.boundingBox(),
    ];
    expect(cardBox?.x ?? 0).toBeGreaterThan(
      (alertsBox?.x ?? 0) + (alertsBox?.width ?? 0) - 1,
    );
  });

  test("a zero count is hidden", async ({ page, request }, testInfo) => {
    const email = uniqueEmail("mon-zero", testInfo);
    await createAccount(request, email);
    await seedAlerts(request, email, "semalertas");
    await logIn(page, email);
    await expect(
      page
        .getByRole("navigation", { name: "Navegação do painel" })
        .getByRole("link", { name: "Monitoramento", exact: true }),
    ).toBeVisible();
  });

  test("loading: the static skeleton (pill, 5 rows, card); no layout shift when the page lands", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("mon-skeleton", testInfo);
    await createAccount(request, email);
    await seedAlerts(request, email, "pm1");
    await logIn(page, email);
    await recordShifts(page);
    await alertFault(request, email, "alerts", "delay", {
      ms: 2_000,
      times: 1,
    });
    await page.goto("/monitoramento", { waitUntil: "commit" });

    const rows = page.locator("[data-skeleton-row]");
    await expect(rows).toHaveCount(5);
    await expect(page.locator("[data-skeleton-pill]")).toBeVisible();
    await expect(page.locator("[data-skeleton-card]")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Monitoramento" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(rows).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as unknown as { __shift: number }).__shift,
      ),
    ).toBe(0);
  });

  test("alertas-falha: error.load.* and Tentar de novo recovers", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("mon-error", testInfo);
    await createAccount(request, email);
    await seedAlerts(request, email, "pm1");
    await logIn(page, email);
    await alertScenario(request, email, "alertas-falha");
    await page.goto("/monitoramento");

    const alert = page.getByRole("alert").filter({
      has: page.getByRole("button", { name: "Tentar de novo" }),
    });
    await expect(alert).toBeVisible();
    await expect(page.getByText("MSG-BACKEND-NAO-EXIBIR")).toHaveCount(0);
    await alertScenario(request, email, "alertas-falha", false);
    await alert.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Monitoramento" }),
    ).toBeVisible();
  });

  test("no session → /entrar?volta=/monitoramento; an expired one adds motivo=sessao", async ({
    page,
    request,
  }, testInfo) => {
    await page.goto("/monitoramento");
    await page.waitForURL(/\/entrar\?volta=%2Fmonitoramento$/);

    const email = uniqueEmail("mon-expired", testInfo);
    await createAccount(request, email);
    await seedAlerts(request, email, "pm1");
    await logIn(page, email);
    await expireSessions(request, email);
    await page.goto("/monitoramento");
    await page.waitForURL(/\/entrar\?motivo=sessao&volta=%2Fmonitoramento$/);
  });
});
