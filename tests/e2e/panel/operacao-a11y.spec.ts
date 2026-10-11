import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { dashboardFault, seedDashboard } from "../fixtures/home-mock.ts";
import {
  createAccount,
  logIn,
  seed,
  setPlan,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";
import { seedSellers, sellerNeedles } from "../fixtures/sellers-mock.ts";

// T146: M8's accessibility, phone and reflow pass (AC 69–76 for S9–S12):
// axe in light and dark on every state, at 1280 (panel-desktop) and 360
// (panel-360, via @panel-phone); no page scroll at 320 px and at 200 % text;
// the keyboard paths through Vendedores and Regras.

async function reflows(page: Page, label: string): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  for (const [width, scale] of [
    [320, "100%"],
    [viewport.width, "200%"],
  ] as const) {
    await page.setViewportSize({ width, height: viewport.height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, scale);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    // On failure, name the elements that stick out (WebKit runs in CI only).
    // On failure, find what widens the page by hiding elements one at a time
    // (WebKit runs in CI only; a text overflow has no box past the edge).
    const culprits =
      overflow > 0
        ? await page.evaluate(() => {
            const doc = document.documentElement;
            const over = () => doc.scrollWidth - doc.clientWidth;
            const describe = (el: Element) =>
              `<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") ?? "").slice(0, 90)}"> "${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50)}"`;
            const found: string[] = [];
            // Walk down from body: keep descending into the child whose
            // removal fixes the overflow, so the deepest such element wins.
            let parent: Element = document.body;
            for (let depth = 0; depth < 30; depth++) {
              let next: Element | undefined;
              for (const child of [...parent.children]) {
                const el = child as HTMLElement;
                const before = el.style.display;
                el.style.display = "none";
                const fixed = over() <= 0;
                el.style.display = before;
                if (fixed) {
                  next = child;
                  break;
                }
              }
              if (!next) break;
              found.push(describe(next));
              parent = next;
            }
            return found.slice(-4);
          })
        : [];
    expect(
      overflow,
      `${label}: AC 74 at ${width}px, ${scale}\n${culprits.join("\n")}`,
    ).toBeLessThanOrEqual(0);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize(viewport);
}

async function check(page: Page, label: string): Promise<void> {
  await expectNoAxeViolations(page);
  await reflows(page, label);
}

/** Tabs forward until `target` has focus (at most `max` presses). */
async function tabTo(page: Page, target: Locator, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

const content = (page: Page) => page.locator("#conteudo");

test.describe("M8 cross-cutting: AC 69–76 on S9–S12 @feature-ops-panel @panel-operacao @panel-phone", () => {
  test("S9 Início: populated, new (Primeiros passos) and a card error", async ({
    page,
    request,
  }, testInfo) => {
    // axe twice per state plus two reflows: slow at 360.
    test.slow();
    const email = uniqueEmail("a11y-inicio", testInfo);
    await seedDashboard(request, email, "populado");
    await logIn(page, email);
    await expect(
      content(page).getByRole("heading", { level: 1 }),
    ).toBeVisible();
    await check(page, "Início populado");

    await dashboardFault(request, email, {
      kind: "omit",
      sem: ["fila", "alertas", "semana"],
    });
    await page.reload();
    await expect(
      content(page).getByText("Esta parte não carregou.").first(),
    ).toBeVisible();
    await check(page, "Início com erro de card");

    const fresh = uniqueEmail("a11y-inicio-novo", testInfo);
    await seedDashboard(request, fresh, "novo");
    await page.context().clearCookies();
    await logIn(page, fresh);
    await expect(
      content(page).getByRole("heading", { level: 1 }),
    ).toBeVisible();
    await check(page, "Início novo");
  });

  test("S10 Vendedores: list, exhausted, dialog, search-empty, detail, not found", async ({
    page,
    request,
  }, testInfo) => {
    // axe twice per state plus two reflows: slow at 360.
    test.slow();
    const email = uniqueEmail("a11y-vendedores", testInfo);
    await seedSellers(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    await expect(content(page).locator("tbody tr")).toHaveCount(50);
    await check(page, "Vendedores");

    await content(page)
      .getByRole("button", { name: "Reverificar" })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press("Escape");

    await page.goto("/vendedores?q=nada-encontrado");
    await expect(
      content(page).getByRole("link", { name: "Limpar busca" }),
    ).toBeVisible();
    await check(page, "Vendedores busca vazia");

    await setPlan(request, email, { usadas: 9, limite: 9 });
    await page.goto("/vendedores");
    await expect(
      content(page).getByRole("button", { name: "Reverificar" }).first(),
    ).toBeDisabled();
    await check(page, "Vendedores sem saldo");

    const [seller] = await sellerNeedles(request, email);
    await page.goto(`/vendedores/${seller?.id}`);
    await expect(
      content(page).getByRole("heading", { level: 1 }),
    ).toBeVisible();
    await check(page, "Vendedor");

    await page.goto("/vendedores/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d");
    await expect(
      page.getByRole("heading", { name: "Vendedor não encontrado" }),
    ).toBeVisible();
    await check(page, "Vendedor não encontrado");
  });

  test("S10 empty: nobody verified yet", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("a11y-vendedores-vazio", testInfo);
    await seedSellers(request, email, "vazio");
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    await expect(
      content(page).getByRole("heading", { name: "Ninguém verificado ainda" }),
    ).toBeVisible();
    await check(page, "Vendedores vazio");
  });

  test("S11 Regras: clean, dirty, nodocs, leave dialog, load error", async ({
    page,
    request,
  }, testInfo) => {
    // axe twice per state plus two reflows: slow at 360.
    test.slow();
    const email = uniqueEmail("a11y-regras", testInfo);
    await createAccount(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fregras");
    await expect(
      page.getByRole("heading", { level: 1, name: "Regras de aprovação" }),
    ).toBeVisible();
    await check(page, "Regras");

    const switches = content(page).getByRole("switch");
    for (let i = 0; i < (await switches.count()); i++)
      if ((await switches.nth(i).getAttribute("aria-checked")) === "true")
        await switches.nth(i).click();
    await content(page).getByRole("button", { name: "Salvar regras" }).click();
    await expect(
      content(page)
        .getByText('Ative pelo menos um documento para usar "Pedir documento".')
        .first(),
    ).toBeVisible();
    await check(page, "Regras nodocs + barra");

    await page
      .getByRole("navigation", { name: "Navegação do painel" })
      .getByRole("link", { name: /^Fila de revisão/ })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Sair sem salvar?" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Continuar editando" }).click();

    const broken = uniqueEmail("a11y-regras-falha", testInfo);
    await createAccount(request, broken);
    await seed(request, "regras-falha", broken);
    await page.context().clearCookies();
    await logIn(page, broken, undefined, "/entrar?volta=%2Fregras");
    await expect(
      content(page).getByRole("button", { name: "Tentar de novo" }),
    ).toBeVisible();
    await check(page, "Regras erro");
  });

  test("S12 Configurações", async ({ page, request }, testInfo) => {
    const email = uniqueEmail("a11y-config", testInfo);
    await createAccount(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fconfiguracoes");
    await expect(
      content(page).getByRole("heading", { level: 1 }),
    ).toBeVisible();
    await check(page, "Configurações");
  });
});

test.describe("M8 keyboard paths @feature-ops-panel @panel-operacao", () => {
  test("Vendedores: search → filter → table → Reverificar dialog → exports → pager", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("teclado-vendedores", testInfo);
    await seedSellers(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    const main = content(page);
    const search = main.getByRole("searchbox", {
      name: "Buscar por nome ou CNPJ",
    });
    await search.focus();
    await tabTo(page, main.getByRole("combobox", { name: "Status" }));
    await tabTo(page, main.getByRole("region", { name: "Vendedores" }));
    const reverify = main.getByRole("button", { name: "Reverificar" }).first();
    await tabTo(page, reverify);
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(reverify).toBeFocused();
    await tabTo(page, main.getByRole("link", { name: "2", exact: true }), 200);
    await tabTo(page, main.getByRole("button", { name: "Exportar CSV" }));
    await tabTo(
      page,
      main.getByRole("button", { name: "Exportar trilha de auditoria" }),
    );
  });

  test("Regras: selects → switches → save bar; Descartar by keyboard", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("teclado-regras", testInfo);
    await createAccount(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fregras");
    const main = content(page);
    const first = main.getByRole("combobox").first();
    await first.focus();
    await tabTo(page, main.getByRole("switch").first());
    await page.keyboard.press("Space");
    await tabTo(page, main.getByRole("button", { name: "Descartar" }));
    await tabTo(page, main.getByRole("button", { name: "Salvar regras" }));
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Enter");
    await expect(
      main.getByRole("region", { name: "Salvar regras" }),
    ).toHaveCount(0);
  });

  test("Início: Copiar link de cadastro → Ocultar (Primeiros passos)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("teclado-inicio", testInfo);
    await seedDashboard(request, email, "novo");
    await logIn(page, email);
    const main = content(page);
    await main.getByRole("heading", { level: 1 }).first().waitFor();
    await page.keyboard.press("Tab");
    await tabTo(
      page,
      main.getByRole("button", { name: "Copiar link de cadastro" }).first(),
    );
    await tabTo(page, main.getByRole("button", { name: "Ocultar" }));
  });

  test("Configurações: the form → Copiar → the password", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("teclado-config", testInfo);
    await createAccount(request, email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fconfiguracoes");
    const main = content(page);
    await main.getByRole("textbox", { name: "Nome da plataforma" }).focus();
    await tabTo(page, main.getByRole("button", { name: "Copiar" }));
    await tabTo(page, main.getByLabel("Senha atual"));
    await tabTo(page, main.getByLabel("Senha nova"));
    await tabTo(page, main.getByRole("button", { name: "Trocar senha" }));
  });
});
