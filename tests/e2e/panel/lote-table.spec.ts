import { expect, test, type Page } from "@playwright/test";

import {
  createAccount,
  createBatch,
  horizontalOverflow,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T83: the result table, its status filter and paging (AC 20 table, AC 21
// filter; contract C2; Security C11).

const bodyRows = (page: Page) =>
  page.getByRole("region", { name: "Resultado" }).last().locator("tbody tr");

test.describe("Lote: the result table @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("25 rows in file order with masked CNPJs; the filter sets ?status= keeping focus and scroll; paging forward and back", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-tabela", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { finish: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);

    await expect(bodyRows(page)).toHaveCount(25);
    await expect(bodyRows(page).first().locator("td").first()).toHaveText(
      /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
    );

    const select = page.getByRole("combobox", { name: "Mostrar" });
    await select.scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => window.scrollY);
    await select.selectOption({ label: "Não consultados" });
    await expect(page).toHaveURL(new RegExp(`/lote/${id}\\?status=erro$`), { timeout: 15_000 });
    await expect(bodyRows(page)).toHaveCount(3);
    await expect(select).toBeFocused();
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - scroll),
    ).toBeLessThan(5);

    await select.selectOption({ label: "Todos" });
    await expect(page).toHaveURL(new RegExp(`/lote/${id}$`), { timeout: 15_000 });
    const first = await bodyRows(page)
      .first()
      .locator("td")
      .first()
      .textContent();
    await page.getByRole("link", { name: "Próximos 25" }).click();
    await expect(page).toHaveURL(/\?cursor=[A-Za-z0-9_-]+$/, { timeout: 15_000 });
    await expect(bodyRows(page).first().locator("td").first()).not.toHaveText(
      first ?? "",
    );
    await page.getByRole("link", { name: "Voltar ao início" }).click();
    await expect(page).toHaveURL(new RegExp(`/lote/${id}$`), { timeout: 15_000 });
    await expect(bodyRows(page).first().locator("td").first()).toHaveText(
      first ?? "",
    );
  });

  for (const query of [
    "?status=todos",
    "?cursor=x%26status%3Dok",
    "?cursor=bm90LWEtY3Vyc29y",
  ])
    test(`an invalid ${query} shows the first page, unfiltered`, async ({
      page,
      request,
    }, testInfo) => {
      const email = uniqueEmail("lote-url", testInfo);
      await createAccount(request, email, "pago");
      const id = await createBatch(request, email, "ac16", { finish: true });
      await logIn(page, email);
      await page.goto(`/lote/${id}${query}`);
      await expect(bodyRows(page)).toHaveCount(25);
      await expect(
        page.getByRole("link", { name: "Próximos 25" }),
      ).toBeVisible();
    });
});

test.describe("Lote: the table below lg @feature-ops-panel @panel-lote @panel-phone", () => {
  test("the table scrolls inside its card; no page scroll at 320", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name === "panel-desktop", "below lg only");
    const email = uniqueEmail("lote-tabela-360", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "hostil", { finish: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    const card = page.getByRole("region", { name: "Resultado" }).last();
    await expect(card.locator("table")).toBeVisible();
    const sizes = await card.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    // The table is 35rem wide at least: it scrolls when the card is narrower
    // (360), and fits as it is at 768.
    if (sizes.client < 560) expect(sizes.scroll).toBeGreaterThan(sizes.client);
    else expect(sizes.scroll).toBe(sizes.client);
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("Lote: an empty filter (P5-005) @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a status with no rows → lote.table.empty in the table; the filter still works", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-tabela-vazia", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "tudo-ok", { finish: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}?status=bad`);
    const table = page.getByRole("region", { name: "Resultado" }).last();
    await expect(
      table.getByRole("cell", {
        name: "Nenhuma empresa com esse status neste lote.",
      }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Mostrar" })
      .selectOption({ label: "Todos" });
    await expect(page).toHaveURL(new RegExp(`/lote/${id}$`), {
      timeout: 15_000,
    });
    await expect(bodyRows(page)).toHaveCount(3);
  });
});

