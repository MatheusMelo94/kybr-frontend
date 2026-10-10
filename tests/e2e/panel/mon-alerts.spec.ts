import { expect, test } from "@playwright/test";

import { caseCnpj } from "../../fixtures/factories/panel.ts";
import { alertScenario, seedAlerts } from "../fixtures/alerts-mock.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T123: the alert list (AC 48, AC 52), the G4 partial state, AC 67 / 71 and
// Security A-F1 / A-F2 on /monitoramento.

const SENTINEL = "MSG-BACKEND-NAO-EXIBIR";
const PM1_CNPJS = [711, 712, 713, 714, 715, 716, 717].map(caseCnpj);

test.describe("Monitoramento alert list (T123) @feature-ops-panel @panel-alertas", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("PM1: seven rows newest first, each with severity, sentence, date and its case action", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("mon-list", testInfo);
    await createAccount(request, email);
    const seeded = await seedAlerts(request, email, "pm1");
    await logIn(page, email);
    await page.goto("/monitoramento");

    const rows = page
      .getByRole("region", { name: "Alertas" })
      .getByRole("article");
    await expect(rows).toHaveCount(7);
    const times = await rows.evaluateAll((articles) =>
      articles.map((a) =>
        Date.parse(a.querySelector("time")?.getAttribute("datetime") ?? ""),
      ),
    );
    expect(times).toEqual([...times].sort((a, b) => b - a));

    // The order of the seed: one row per type.
    await expect(rows.nth(0)).toHaveAccessibleName(
      /ficou inapta na Receita\.$/,
    );
    await expect(rows.nth(1)).toHaveAccessibleName(
      /teve a inscrição estadual suspensa em SP\.$/,
    );
    await expect(rows.nth(2)).toHaveAccessibleName(
      /^Pessoa Exemplo Souza saiu do quadro de sócios de /,
    );
    await expect(rows.nth(3)).toHaveAccessibleName(
      /^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2} mudou o quadro de sócios\.$/,
    );
    await expect(rows.nth(4)).toHaveAccessibleName(
      /mudou a atividade principal para 47\.89-0-99/,
    );
    await expect(rows.nth(5)).toHaveAccessibleName(
      /passou de MEI para Simples Nacional\.$/,
    );
    await expect(rows.nth(6)).toHaveAccessibleName(
      /^O webhook não respondeu ao avisar sobre /,
    );

    await expect(rows.nth(0).getByText("Crítico")).toBeVisible();
    await expect(rows.nth(2).getByText("Atenção")).toBeVisible();
    await expect(rows.nth(3).getByText("Informativo")).toBeVisible();
    await expect(rows.nth(2).getByText("Com pedido aberto")).toBeVisible();
    await expect(
      page.getByText("Com pedido aberto", { exact: true }),
    ).toHaveCount(1);

    const openCase = seeded.find(
      (a) => a.tipo === "SITUACAO_IRREGULAR",
    )?.case_id;
    await expect(
      rows.nth(0).getByRole("link", { name: "Decidir", exact: true }),
    ).toHaveAttribute("href", `/fila/${openCase}`);
    await expect(rows.nth(1).getByText("Decidido: Bloqueado")).toBeVisible();
    await expect(rows.nth(1).getByRole("link")).toHaveCount(0);
    // AC 52: the webhook failure has no case link.
    await expect(rows.nth(6).getByRole("link")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Decidir", exact: true }),
    ).toHaveCount(1);

    // AC 67: no backend prose; A-F1: no wire-form CNPJ in the HTML.
    expect(await page.locator("body").innerText()).not.toContain(SENTINEL);
    const html = await page.content();
    for (const cnpj of PM1_CNPJS) expect(html).not.toContain(cnpj);

    // AC 71: in grayscale the severity is still in words.
    await page.evaluate(() => {
      document.documentElement.style.filter = "grayscale(1)";
    });
    for (const word of ["Crítico", "Atenção", "Informativo"])
      await expect(rows.getByText(word, { exact: true }).first()).toBeVisible();
  });

  test("Decidir opens the case", async ({ page, request }, testInfo) => {
    const email = uniqueEmail("mon-decidir", testInfo);
    await createAccount(request, email);
    const seeded = await seedAlerts(request, email, "um-critico");
    await logIn(page, email);
    await page.goto("/monitoramento");
    await page.getByRole("link", { name: "Decidir", exact: true }).click();
    await page.waitForURL(`**/fila/${seeded[0]?.case_id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("G4: monitoramento-falha with alerts → the alerts render, the pill hides, no error copy", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("mon-partial", testInfo);
    await createAccount(request, email);
    await seedAlerts(request, email, "pm1");
    await alertScenario(request, email, "monitoramento-falha");
    await logIn(page, email);
    await page.goto("/monitoramento");

    await expect(
      page.getByRole("region", { name: "Alertas" }).getByRole("article"),
    ).toHaveCount(7);
    await expect(page.getByText(/^Ativo\./)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Tentar de novo" }),
    ).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain(SENTINEL);
  });

  test("A-F2: hostile dados render as text", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("mon-hostil", testInfo);
    await createAccount(request, email);
    await seedAlerts(request, email, "hostil");
    let dialog = false;
    page.on("dialog", () => {
      dialog = true;
    });
    await logIn(page, email);
    await page.goto("/monitoramento");
    const rows = page
      .getByRole("region", { name: "Alertas" })
      .getByRole("article");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("<img src=x onerror=alert(1)>");
    await expect(rows.locator("img, b")).toHaveCount(0);
    expect(dialog).toBe(false);
  });
});
