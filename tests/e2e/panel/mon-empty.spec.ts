import { expect, test, type Page } from "@playwright/test";

import { ALERT_EMAILS } from "../../fixtures/factories/panel.ts";
import { seedAlerts, setAlertClock } from "../fixtures/alerts-mock.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T124: the three empty states (AC 49), on per-test accounts at a fixed
// clock (QA G3), plus the seeded semmonitor@ account (PM3).

const NOW = "2026-10-07T15:00:00.000Z"; // Wednesday, 12:00 in Brasília

async function emptyFor(
  page: Page,
  request: Parameters<typeof seedAlerts>[0],
  email: string,
  preset: "vazio" | "semvarredura" | "semalertas",
): Promise<void> {
  await createAccount(request, email);
  await setAlertClock(request, email, NOW);
  await seedAlerts(request, email, preset);
  await logIn(page, email);
  await page.goto("/monitoramento");
}

test.describe("Monitoramento empty states (T124) @feature-ops-panel @panel-alertas", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("nothing monitored: mon.empty.unmonitored, Verificar em lote → /lote, no pill", async ({
    page,
    request,
  }, testInfo) => {
    await emptyFor(page, request, uniqueEmail("mon-vazio", testInfo), "vazio");
    const region = page.getByRole("region", { name: "Alertas" });
    await expect(
      region.getByText(
        "Nenhum vendedor monitorado ainda. Ative o monitoramento no resultado de um lote.",
      ),
    ).toBeVisible();
    await expect(page.locator("main").getByText(/^Ativo\./)).toHaveCount(0);
    await expect(region.getByRole("article")).toHaveCount(0);
    await region.getByRole("link", { name: "Verificar em lote" }).click();
    await page.waitForURL("**/lote");
  });

  test("monitored, no sweep yet: mon.empty.nosweep with the first sweep's date", async ({
    page,
    request,
  }, testInfo) => {
    await emptyFor(
      page,
      request,
      uniqueEmail("mon-semvarredura", testInfo),
      "semvarredura",
    );
    await expect(
      page
        .locator("main")
        .getByText(
          "A primeira varredura acontece em 12/10/2026. Os alertas aparecem aqui.",
        ),
    ).toBeVisible();
    await expect(
      page
        .locator("main")
        .getByText("Ativo. Próxima varredura: segunda-feira, 06:00"),
    ).toBeVisible();
  });

  test("swept, no alerts: mon.empty.noalerts with the last sweep's date", async ({
    page,
    request,
  }, testInfo) => {
    await emptyFor(
      page,
      request,
      uniqueEmail("mon-semalertas", testInfo),
      "semalertas",
    );
    await expect(
      page
        .locator("main")
        .getByText(
          "Nenhuma mudança encontrada. A última varredura foi em 05/10/2026.",
        ),
    ).toBeVisible();
  });

  test("PM3: the seeded semmonitor@ account", async ({ page }) => {
    await logIn(page, ALERT_EMAILS.semmonitor);
    await page.goto("/monitoramento");
    await expect(
      page.locator("main").getByText(/^Nenhum vendedor monitorado ainda\./),
    ).toBeVisible();
  });
});
