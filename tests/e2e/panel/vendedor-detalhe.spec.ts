import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { SETTLE } from "../fixtures/fila-timing.ts";
import { logIn, uniqueEmail } from "../fixtures/panel-mock.ts";
import { seedSellers, sellerNeedles } from "../fixtures/sellers-mock.ts";

// T143: the seller detail (AC 58, AC 73, G9, O-F4): from the list, the
// latest verification read-only, the history, Abrir caso, Reverificar, the
// proof, and the identical not found for a bad, unknown or foreign id.

const PS10_N = 7;
const NOT_FOUND = "Vendedor não encontrado";

test.describe("Vendedores: the detail @feature-ops-panel @panel-operacao @panel-vendedores @panel-phone", () => {
  test("AC 58: from the list to the detail; Abrir caso → /fila/{id}", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("detalhe", testInfo);
    await seedSellers(request, email);
    const target = (await sellerNeedles(request, email)).find(
      (needle) => needle.n === PS10_N,
    );
    if (!target?.case_aberto_id) throw new Error("no PS10 seller");
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");

    await page
      .locator(`#conteudo [data-seller-row="${target.id}"]`)
      .getByRole("link")
      .click();
    await page.waitForURL(`**/vendedores/${target.id}`);
    const content = page.locator("#conteudo");
    await expect(content.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(content.getByText("Resultado das regras:")).toBeAttached();
    await expect(
      content.getByRole("heading", { name: "Verificações anteriores" }),
    ).toBeVisible();
    await expect(content.getByRole("button", { name: "Aprovar" })).toHaveCount(
      0,
    );
    await expect(
      content.getByRole("button", { name: "Reverificar" }),
    ).toBeEnabled();

    await content.getByRole("link", { name: "Abrir caso" }).click();
    await page.waitForURL(`**/fila/${target.case_aberto_id}`, SETTLE);
  });

  test("the proof downloads as a PDF", async ({ page, request }, testInfo) => {
    const email = uniqueEmail("detalhe-prova", testInfo);
    await seedSellers(request, email);
    const [target] = await sellerNeedles(request, email);
    await logIn(
      page,
      email,
      undefined,
      `/entrar?volta=${encodeURIComponent(`/vendedores/${target?.id}`)}`,
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .locator("#conteudo")
        .getByRole("button", { name: "Baixar comprovante" })
        .click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^kybr-comprovante-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    const bytes = readFileSync(await download.path());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("AC 73: a bad, unknown or foreign id is the same 404", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("detalhe-404", testInfo);
    const other = uniqueEmail("detalhe-404-outro", testInfo);
    await seedSellers(request, email);
    await seedSellers(request, other);
    const [foreign] = await sellerNeedles(request, other);
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");

    const bodies: string[] = [];
    for (const id of [
      "nao-e-um-id",
      "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      foreign?.id,
    ]) {
      const response = await page.goto(`/vendedores/${id}`);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: NOT_FOUND }),
      ).toBeVisible();
      bodies.push((await page.locator("#conteudo").innerText()).trim());
    }
    expect(new Set(bodies).size).toBe(1);
  });

  test("Reverificar from the detail: confirm, then Reverificando…", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("detalhe-reverificar", testInfo);
    await seedSellers(request, email);
    const [target] = await sellerNeedles(request, email);
    await logIn(
      page,
      email,
      undefined,
      `/entrar?volta=${encodeURIComponent(`/vendedores/${target?.id}`)}`,
    );
    const content = page.locator("#conteudo");
    await content.getByRole("button", { name: "Reverificar" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Reverificar" })
      .click();
    await expect(content.getByText("Reverificando…")).toBeVisible(SETTLE);
  });
});
