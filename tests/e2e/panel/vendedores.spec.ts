import { expect, test, type Page } from "@playwright/test";

import {
  horizontalOverflow,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";
import {
  seedSellers,
  sellerNeedles,
  sellersFault,
} from "../fixtures/sellers-mock.ts";

// T140: Vendedores (S10, AC 55): the table, the URL state (q, status,
// pagina), the search by a masked CNPJ, the empty states, the error, O-F4
// (CNPJs and the CPF in MEI names masked) and O-F6 (q never in the title).

const masked = (cnpj: string): string =>
  `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;

const table = (page: Page) =>
  page.locator("#conteudo").getByRole("region", { name: "Vendedores" });
const bodyRows = (page: Page) => table(page).locator("tbody tr");

test.describe("Vendedores @feature-ops-panel @panel-operacao @panel-vendedores", () => {
  test("AC 55: the columns, 50 per page, numbered pages in the URL; the nav item with its count", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("vendedores", testInfo);
    await seedSellers(request, email);
    await logIn(page, email);
    await page
      .getByRole("navigation", { name: "Navegação do painel" })
      .getByRole("link", { name: /^Vendedores/ })
      .click();
    await page.waitForURL(/\/vendedores$/);
    await expect(page).toHaveTitle("Vendedores · Kybr");
    await expect(
      page.getByRole("heading", { level: 1, name: "Vendedores" }),
    ).toBeVisible();

    await expect(table(page).getByRole("columnheader")).toHaveText([
      "Vendedor",
      "Responsável",
      "Origem",
      "Verificado em",
      "Status hoje",
      "Monitorado",
    ]);
    await expect(bodyRows(page)).toHaveCount(50);
    await expect(
      table(page)
        .getByText(/^Mudou: /)
        .first(),
    ).toBeVisible();
    await expect(table(page).getByText("Não informado").first()).toBeVisible();
    await expect(
      table(page)
        .getByText(/^\d{2}\/\d{2}\/\d{4}$/)
        .first(),
    ).toBeVisible();

    const pages = page.locator("#conteudo").getByRole("link", { name: /^\d$/ });
    await expect(pages).toHaveText(["1", "2", "3"]);
    await expect(pages.nth(0)).toHaveAttribute("aria-current", "page");
    await pages.nth(2).click();
    await page.waitForURL(/\/vendedores\?pagina=3$/);
    await expect(bodyRows(page)).toHaveCount(20);
  });

  test("O-F4: CNPJs and the CPF in MEI names are masked in the HTML; markup renders as text", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("vendedores-mask", testInfo);
    await seedSellers(request, email);
    const needles = await sellerNeedles(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    await expect(bodyRows(page)).toHaveCount(50);

    await expect(
      table(page).getByText("Fulano ***.***.***-** ME"),
    ).toBeVisible();
    await expect(
      table(page).getByText("Beltrano ***.***.***-**"),
    ).toBeVisible();
    const first = needles.find((needle) => needle.n === 1);
    if (!first) throw new Error("no seller 1");
    await expect(table(page).getByText(masked(first.cnpj))).toBeVisible();

    const html = await page.content();
    expect(html).not.toMatch(/123\.456\.789-09|12345678909/);
    for (const needle of needles.slice(0, 50))
      expect(html).not.toContain(needle.cnpj);
    expect(await table(page).locator("img").count()).toBe(0);
  });

  test("a search by a masked CNPJ finds the seller; the filter keeps q and resets the page; q is never in the title (O-F6)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("vendedores-busca", testInfo);
    await seedSellers(request, email);
    const target = (await sellerNeedles(request, email)).find(
      (needle) => needle.n === 42,
    );
    if (!target) throw new Error("no seller 42");
    await logIn(
      page,
      email,
      undefined,
      "/entrar?volta=%2Fvendedores%3Fpagina%3D2",
    );
    await expect(bodyRows(page)).toHaveCount(50);

    const search = page.getByRole("searchbox", {
      name: "Buscar por nome ou CNPJ",
    });
    await search.fill(masked(target.cnpj));
    await search.press("Enter");
    await page.waitForURL(/\/vendedores\?q=/);
    await expect(bodyRows(page)).toHaveCount(1);
    await expect(bodyRows(page)).toContainText("Vendedor Exemplo 42 Ltda");
    expect(await page.title()).toBe("Vendedores · Kybr");

    await page.goto("/vendedores?pagina=2&q=exemplo");
    await page
      .getByRole("combobox", { name: "Status" })
      .selectOption("bloqueado");
    await page.waitForURL(/\/vendedores\?status=bloqueado&q=exemplo$/);
    await expect(bodyRows(page).first()).toContainText("Bloqueado");
    expect(await page.title()).not.toContain("exemplo");
  });

  test("empty states: nobody yet (copy link + Verificar em lote), then a search with Limpar busca", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("vendedores-vazio", testInfo);
    await seedSellers(request, email, "vazio");
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    await expect(
      page.getByRole("heading", { name: "Ninguém verificado ainda" }),
    ).toBeVisible();
    await expect(
      page
        .locator("#conteudo")
        .getByRole("button", { name: "Copiar link de cadastro" }),
    ).toBeVisible();
    await expect(
      page
        .locator("#conteudo")
        .getByRole("link", { name: "Verificar em lote" }),
    ).toHaveAttribute("href", "/lote");

    await seedSellers(request, email);
    await page.goto("/vendedores?q=ninguem-com-este-nome");
    await expect(
      page.getByText(
        'Nenhum vendedor encontrado para "ninguem-com-este-nome".',
      ),
    ).toBeVisible();
    await page.getByRole("link", { name: "Limpar busca" }).click();
    await page.waitForURL(/\/vendedores$/);
    await expect(bodyRows(page)).toHaveCount(50);
  });

  test("error: error.load.* with a retry that loads the list", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("vendedores-erro", testInfo);
    await seedSellers(request, email);
    await logIn(page, email);
    await sellersFault(request, email, "sellers", "500", { times: 1 });
    await page.goto("/vendedores");
    await expect(
      page.getByRole("heading", { name: "Não carregou" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(bodyRows(page)).toHaveCount(50);
  });
});

test.describe("Vendedores on a phone @feature-ops-panel @panel-operacao @panel-vendedores @panel-phone", () => {
  test("the table scrolls inside its card; the page never scrolls sideways", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("vendedores-fone", testInfo);
    await seedSellers(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    await expect(bodyRows(page)).toHaveCount(50);
    expect(await horizontalOverflow(page)).toBe(0);
    const region = table(page);
    const scrolls = await region.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    );
    // At 360 the card scrolls; the six columns' min-content (about 780 px)
    // also overflows the 768 column by a few pixels, inside the card. At
    // 1280 it fits.
    expect(scrolls).toBe((page.viewportSize()?.width ?? 1280) <= 768);
  });
});
