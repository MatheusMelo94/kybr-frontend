import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { SETTLE } from "../fixtures/fila-timing.ts";
import { seedDashboard } from "../fixtures/home-mock.ts";
import { LINK_URL, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";
import {
  completeReverify,
  seedSellers,
  sellerNeedles,
} from "../fixtures/sellers-mock.ts";

// T148: M8's journeys at 1280 (panel-desktop): A (Início → Configurações →
// /v/{slug} → copy → Ocultar), B (Vendedores → search → filter → Reverificar
// → complete → export → detail → Abrir caso), C (Regras → leave dialog →
// save → the Fila's Pedir documento lists the new documents).

const PS10_N = 7;
const masked = (cnpj: string): string =>
  `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
const content = (page: Page) => page.locator("#conteudo");
const nav = (page: Page) =>
  page.getByRole("navigation", { name: "Navegação do painel" });

test.describe("M8 journeys @feature-ops-panel @panel-operacao", () => {
  test("Journey A: a new workspace's Início → Configurações → /v/{slug} → copy the link → Ocultar", async ({
    page,
    context,
    request,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "clipboard permissions: chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const email = uniqueEmail("jornada-a", testInfo);
    await seedDashboard(request, email, "novo");
    await logIn(page, email);
    const steps = content(page).getByRole("region", {
      name: "Primeiros passos",
    });
    await expect(steps).toBeVisible();

    await page.getByRole("button", { name: "Conta" }).first().click();
    await page.getByRole("menuitem", { name: "Configurações" }).click();
    await page.waitForURL(/\/configuracoes$/);
    const link = await content(page)
      .getByRole("textbox", { name: "Link de cadastro" })
      .inputValue();
    const nome = `Plataforma Jornada ${Date.now()}`;
    await content(page)
      .getByRole("textbox", { name: "Nome da plataforma" })
      .fill(nome);
    await content(page).getByRole("radio", { name: "Página de ajuda" }).check();
    await content(page)
      .getByRole("textbox", { name: "Endereço da página de ajuda" })
      .fill("https://ajuda.exemplo.test/jornada");
    await content(page)
      .getByRole("button", { name: "Salvar alterações" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Alterações salvas" }),
    ).toBeVisible(SETTLE);

    const slug = new URL(link).pathname.split("/").at(-1) ?? "";
    const seller = await context.newPage();
    await seller.goto(`${LINK_URL}/v/${slug}`);
    await expect(seller.getByText(nome).first()).toBeVisible();
    await seller.close();

    await nav(page).getByRole("link", { name: "Início" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await content(page)
      .getByRole("button", { name: "Copiar link de cadastro" })
      .first()
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Link copiado" }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      link,
    );
    await steps.getByRole("button", { name: "Ocultar" }).click();
    await expect(steps).toHaveCount(0, SETTLE);
  });

  test("Journey B: search → Mudou → Reverificar → complete → export → the detail → Abrir caso", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("jornada-b", testInfo);
    await seedSellers(request, email);
    const target = (await sellerNeedles(request, email)).find(
      (needle) => needle.n === PS10_N,
    );
    if (!target?.case_aberto_id) throw new Error("no PS10 seller");
    await logIn(page, email);
    await nav(page)
      .getByRole("link", { name: /^Vendedores/ })
      .click();
    await page.waitForURL(/\/vendedores$/);

    const search = content(page).getByRole("searchbox", {
      name: "Buscar por nome ou CNPJ",
    });
    await search.fill(masked(target.cnpj));
    await search.press("Enter");
    await page.waitForURL(/\/vendedores\?q=/);
    await content(page)
      .getByRole("combobox", { name: "Status" })
      .selectOption("mudou");
    await page.waitForURL(/status=mudou/);
    const row = content(page).locator(`[data-seller-row="${target.id}"]`);
    await expect(row).toContainText(/Mudou/);

    await row.getByRole("button", { name: "Reverificar" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Reverificar" })
      .click();
    await expect(row).toContainText("Reverificando…", SETTLE);
    await completeReverify(request, target.id);

    await page.goto(`/vendedores?q=${encodeURIComponent(masked(target.cnpj))}`);
    await expect(row).not.toContainText(/Mudou|Reverificando/);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      content(page).getByRole("button", { name: "Exportar CSV" }).click(),
    ]);
    const csv = readFileSync(await download.path(), "utf8");
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);

    await row.getByRole("link").click();
    await page.waitForURL(`**/vendedores/${target.id}`);
    await content(page).getByRole("link", { name: "Abrir caso" }).click();
    await page.waitForURL(`**/fila/${target.case_aberto_id}`, SETTLE);
  });

  test("Journey C: Regras → leave (stay) → save → the Fila's Pedir documento lists the new documents", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("jornada-c", testInfo);
    await seedDashboard(request, email, "populado");
    await logIn(page, email);
    await nav(page).getByRole("link", { name: "Regras" }).click();
    await page.waitForURL(/\/regras$/);

    const toggle = content(page).getByRole("switch", {
      name: "Procuração do responsável",
    });
    const wasOn = (await toggle.getAttribute("aria-checked")) === "true";
    await toggle.click();

    await nav(page)
      .getByRole("link", { name: /^Fila de revisão/ })
      .click();
    const leave = page.getByRole("dialog", { name: "Sair sem salvar?" });
    await expect(leave).toBeVisible();
    await leave.getByRole("button", { name: "Continuar editando" }).click();
    await expect(page).toHaveURL(/\/regras$/);

    await content(page).getByRole("button", { name: "Salvar regras" }).click();
    await expect(page.getByText("Regras salvas")).toBeVisible(SETTLE);

    await nav(page)
      .getByRole("link", { name: /^Fila de revisão/ })
      .click();
    // At 1280 the Fila opens its oldest case.
    await page.waitForURL(/\/fila\/[\w-]+$/, SETTLE);
    const pedir = page.getByRole("button", {
      name: "Pedir documento",
      exact: true,
    });
    await pedir.click();
    const group = page
      .getByRole("dialog")
      .getByRole("group", { name: "Quais documentos?" });
    const procuracao = group.getByRole("checkbox", {
      name: "Procuração do responsável",
    });
    await expect(procuracao).toHaveCount(wasOn ? 0 : 1);
  });
});
