import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { SETTLE } from "../fixtures/fila-timing.ts";
import { logIn, uniqueEmail } from "../fixtures/panel-mock.ts";
import { seedSellers, sellersFault } from "../fixtures/sellers-mock.ts";

// T142: Vendedores' exports (AC 57, O-F5, P08, Q5): the filter's CSV with
// the count hint, the audit trail over De/Até, export.error (+ too_large for
// the audit) and the anonymous handlers.

const EXPORT_ERROR = "Não conseguimos gerar o arquivo. Tente de novo.";
const TOO_LARGE =
  "O arquivo ficou grande demais. Reduza o período e tente de novo.";

const today = (): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

async function save(
  page: Page,
  name: string,
): Promise<{ filename: string; text: string }> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#conteudo").getByRole("button", { name }).click(),
  ]);
  const path = await download.path();
  return {
    filename: download.suggestedFilename(),
    text: readFileSync(path, "utf8"),
  };
}

test.describe("Vendedores: exports @feature-ops-panel @panel-operacao @panel-vendedores @panel-phone", () => {
  test("AC 57: the filter's CSV, dated, re-escaped (PS6), with the count hint", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("exportar", testInfo);
    await seedSellers(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    const button = page
      .locator("#conteudo")
      .getByRole("button", { name: "Exportar CSV" });
    await expect(button).toHaveAccessibleDescription(
      "Exporta os 120 vendedores do filtro atual.",
    );
    const file = await save(page, "Exportar CSV");
    expect(file.filename).toBe(`kybr-vendedores-${today()}.csv`);
    expect(file.text).toContain('"\'=HYPERLINK(""http://exemplo.test"")"');
    expect(file.text.trimEnd().split("\r\n")).toHaveLength(121);

    await page.goto("/vendedores?status=bloqueado");
    const hint = await button.evaluate(
      (element) =>
        document.getElementById(element.getAttribute("aria-describedby") ?? "")
          ?.textContent ?? "",
    );
    const n = Number(/(\d+)/.exec(hint)?.[1] ?? "0");
    const filtered = await save(page, "Exportar CSV");
    expect(filtered.text.trimEnd().split("\r\n")).toHaveLength(n + 1);
  });

  test("the audit trail over the default last 3 months; no IP or session column (Q5)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("auditoria", testInfo);
    await seedSellers(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    await expect(page.getByLabel("De", { exact: true })).not.toHaveValue("");
    await expect(page.getByLabel("Até", { exact: true })).toHaveValue(today());
    const file = await save(page, "Exportar trilha de auditoria");
    expect(file.filename).toBe(`kybr-auditoria-${today()}.csv`);
    const header = file.text.split("\r\n")[0] ?? "";
    expect(header).toContain("Data e hora");
    expect(header).not.toMatch(/IP|sess/i);
  });

  test("failures: export.error; the audit over the cap adds export.too_large (O-F5, G11)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("exportar-falha", testInfo);
    await seedSellers(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    const content = page.locator("#conteudo");

    await sellersFault(request, email, "sellers-csv", "500", { times: 1 });
    await content.getByRole("button", { name: "Exportar CSV" }).click();
    // P8-009: both regions are always mounted; the CSV's is the first.
    const alerts = content.getByRole("alert");
    await expect(alerts).toHaveCount(2);
    await expect(alerts.first()).toHaveText(EXPORT_ERROR, SETTLE);

    await sellersFault(request, email, "audit-csv", "csv-grande", {
      times: 1,
    });
    await content
      .getByRole("button", { name: "Exportar trilha de auditoria" })
      .click();
    await expect(content.getByRole("alert").last()).toHaveText(
      `${EXPORT_ERROR} ${TOO_LARGE}`,
      SETTLE,
    );
  });

  test("anonymous: both handlers redirect to /entrar", async ({ request }) => {
    for (const path of [
      "/vendedores/exportar.csv",
      "/vendedores/auditoria.csv",
    ]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toMatch(/\/entrar/);
    }
  });
});
