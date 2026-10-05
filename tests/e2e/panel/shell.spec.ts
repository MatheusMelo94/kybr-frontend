import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// S5 Shell at 1280 (AC 9, AC 11, AC 12), T55. Pre-Contract: D-W1.

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("shell at 1280 @feature-ops-panel @panel-access @panel-smoke", () => {
  test("AC 9 + AC 11: a 240 px sidebar with the brand, the workspace, the build's nav with the late count, and the plan block", async ({
    page,
    request,
  }, testInfo) => {
    await page.addInitScript(() => {
      const store = window as unknown as { __cls: number };
      store.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[])
          if (!entry.hadRecentInput) store.__cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    const email = uniqueEmail("shell", testInfo);
    await createAccount(request, email, "renata");
    await logIn(page, email);

    const sidebar = page.locator("aside");
    expect((await sidebar.boundingBox())?.width).toBe(240);
    // The sidebar top (brand v1): the symbol, the workspace, the plan title.
    const symbol = sidebar.getByRole("img", { name: "Kybr" });
    expect((await symbol.boundingBox())?.width).toBe(32);
    await expect(sidebar.getByText("Kybr", { exact: true })).toHaveCount(0);
    await expect(sidebar.getByText("Loja Exemplo")).toBeVisible();
    await expect(sidebar.getByText("1.240 vendedores")).toHaveCount(0);

    const nav = page.getByRole("navigation", { name: "Navegação do painel" });
    await expect(nav.getByRole("link")).toHaveCount(1);
    await expect(
      nav.getByRole("link", {
        name: "Fila de revisão 7 casos para decidir, 2 fora do prazo",
      }),
    ).toBeVisible();
    await expect(
      nav.getByText("2 fora do prazo", { exact: true }),
    ).toBeVisible();

    // Twice: the sidebar top's plan title and the plan block's.
    await expect(sidebar.getByText("Teste grátis")).toHaveCount(2);
    await expect(sidebar.getByText("40 de 200 verificações")).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Contratar" })).toHaveCount(
      0,
    );

    await expectNoAxeViolations(page);
    if (testInfo.project.name !== "panel-firefox")
      expect(
        await page.evaluate(
          () => (window as unknown as { __cls: number }).__cls,
        ),
      ).toBe(0);
  });

  test("AC 12: a paid plan, an exhausted trial, and a /me without counts or plan", async ({
    page,
    request,
  }, testInfo) => {
    for (const [preset, expected] of [
      [
        "pago",
        [
          "Plano Essencial",
          "1.240 de 5.000 verificações neste ciclo",
          "Ciclo até 04/11/2026",
        ],
      ],
      [
        "esgotado",
        [
          "As verificações do plano acabaram. Contrate para continuar verificando.",
        ],
      ],
    ] as const) {
      const email = uniqueEmail(preset, testInfo);
      await createAccount(request, email, preset);
      await page.context().clearCookies();
      await logIn(page, email);
      for (const text of expected)
        await expect(page.locator("aside").getByText(text).last()).toBeVisible();
    }

    const partial = uniqueEmail("parcial", testInfo);
    await createAccount(request, partial, "parcial");
    await page.context().clearCookies();
    await logIn(page, partial);
    const sidebar = page.locator("aside");
    await expect(
      sidebar.getByRole("link", { name: "Fila de revisão" }),
    ).toBeVisible();
    await expect(sidebar.getByText(/verificações/)).toHaveCount(0);
    await expect(sidebar.getByText(/vendedores/)).toHaveCount(0);
  });

  test("the account menu is a menu button: Enter opens on Sair, Esc closes and returns focus; no Configurações yet", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("menu", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    const button = page.getByRole("button", { name: "Conta" });

    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("menuitem", { name: "Sair" })).toBeFocused();
    await expect(
      page.getByRole("menuitem", { name: "Configurações" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test("the first Tab is the skip link, visible on focus; Enter moves to the main content", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("pular", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    // A fresh load: the document is where the first Tab starts.
    await page.reload();
    await page.keyboard.press("Tab");

    const skip = page.getByRole("link", { name: "Pular para o conteúdo" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#conteudo")).toBeFocused();
  });
});
