import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  caseFault,
  caseSeed,
  casesFor,
  seedCases,
} from "../fixtures/fila-mock.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T98: the list, its tabs, "Carregar mais", the empty states and ListError
// (AC 27 list half, AC 28 error half, AC 46).

test.describe("Fila list (T98) @feature-ops-panel @panel-fila", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("PC1: the tabs, 25 items in SLA order, Carregar mais 5 → 30, scroll kept", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-lista", testInfo);
    await createAccount(request, email);
    const seeded = await seedCases(request, email, "pc1");
    const open = (await casesFor(request, email)).filter(
      (c) => c.estado === "aberto",
    );
    expect(open).toHaveLength(30);
    expect(seeded.length).toBeGreaterThan(30);
    await logIn(page, email);
    await page.goto("/fila");

    const tabOpen = page.getByRole("link", { name: /^Para decidir/ });
    await expect(tabOpen).toHaveAttribute("aria-current", "page");
    await expect(tabOpen).toHaveText(/\(\d+\)$/);
    await expect(
      page.getByRole("link", { name: /^Aguardando vendedor/ }),
    ).not.toHaveAttribute("aria-current", "page");

    const listbox = page.getByRole("listbox", { name: /^Para decidir/ });
    const options = listbox.getByRole("option");
    await expect(options).toHaveCount(25);
    // The server's order (the mock's /cases control lists by SLA too).
    const names = open.slice(0, 3).map((c) => c.razao_social ?? "");
    for (const [i, name] of names.entries())
      await expect(options.nth(i)).toContainText(name);
    await expect(listbox.getByText(/^Atrasado há /).first()).toBeVisible();
    await expect(listbox.getByText(/^Vence em /).first()).toBeVisible();

    const more = page.getByRole("link", { name: "Carregar mais 5" });
    await more.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    await more.click();
    await expect(page).toHaveURL(/\/fila\?ate=50$/);
    await expect(options).toHaveCount(30);
    await expect(
      page.getByRole("link", { name: /^Carregar mais/ }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await expectNoAxeViolations(page);
  });

  test("Aguardando vendedor: ?aba=aguardando lists the waiting cases", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-aguarda", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "pc1");
    const waiting = (await casesFor(request, email)).filter(
      (c) => c.estado === "aguardando_doc",
    );
    await logIn(page, email);
    await page.goto("/fila");
    await page.getByRole("link", { name: /^Aguardando vendedor/ }).click();
    await expect(page).toHaveURL(/\/fila\?aba=aguardando$/);
    await expect(
      page.getByRole("link", { name: /^Aguardando vendedor/ }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page
        .getByRole("listbox", { name: /^Aguardando vendedor/ })
        .getByRole("option"),
    ).toHaveCount(waiting.length);
  });

  test("bad ?aba= and ?ate= fall back to the defaults (F12)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-params", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "pc1");
    await logIn(page, email);
    for (const query of [
      "?ate=abc",
      "?ate=37",
      "?ate=10000",
      "?aba=x&ate=-25",
    ]) {
      await page.goto(`/fila${query}`);
      await expect(
        page
          .getByRole("listbox", { name: /^Para decidir/ })
          .getByRole("option"),
      ).toHaveCount(25);
    }
  });

  test("empty Para decidir: the message fills the detail pane once, Verificar em lote → /lote", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-vazia", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "vazia");
    await logIn(page, email);
    await page.goto("/fila");
    const heading = page.getByRole("heading", { name: "Nenhum caso aberto" });
    await expect(heading).toHaveCount(1);
    await expect(
      page.locator("[data-pane='detail']").getByRole("heading", {
        name: "Nenhum caso aberto",
      }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    // The nav has its own "Verificar em lote": this is the detail pane's.
    await page
      .locator("[data-pane='detail']")
      .getByRole("link", { name: "Verificar em lote" })
      .click();
    await expect(page).toHaveURL(/\/lote$/);
  });

  test("empty Aguardando vendedor: fila.waiting.empty", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-aguarda-vazia", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "vazia");
    await logIn(page, email);
    await page.goto("/fila?aba=aguardando");
    await expect(
      page
        .getByText("Nenhum vendedor com documento pendente.")
        .filter({ visible: true }),
    ).toHaveCount(1);
  });

  test("lista-falha: the error.load.* banner in the list pane; Tentar de novo recovers", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-lista-falha", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "um");
    await caseSeed(request, email, "lista-falha");
    await logIn(page, email);
    await page.goto("/fila");
    const banner = page.locator("[data-pane='list']").getByRole("alert");
    await expect(banner).toContainText("Não carregou");
    await expect(
      page.getByRole("heading", { level: 1, name: "Fila de revisão" }),
    ).toBeVisible();
    await caseFault(request, email, "list", "none");
    await banner.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
    await expect(banner).toHaveCount(0);
  });
});

test.describe("Fila list on phones (T98) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("the list pane holds the tabs, items and the empty message", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-lista-fone", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    await logIn(page, email);
    await page.goto("/fila");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
    await expectNoAxeViolations(page);

    await seedCases(request, email, "vazia");
    await page.goto("/fila");
    await expect(
      page
        .getByRole("heading", { name: "Nenhum caso aberto" })
        .filter({ visible: true }),
    ).toHaveCount(1);
    // Below lg the list pane holds it; at lg the detail pane does.
    const pane = (page.viewportSize()?.width ?? 0) < 1024 ? "list" : "detail";
    await expect(
      page
        .locator(`[data-pane='${pane}']`)
        .getByRole("link", { name: "Verificar em lote" }),
    ).toBeVisible();
  });
});
