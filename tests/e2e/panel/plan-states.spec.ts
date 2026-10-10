import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  createAccount,
  horizontalOverflow,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T66 (P4-008): the plan variant in "Conta" below lg (AC 10) and the plan
// banner on /fila at every width (AC 12, the Fila half). The E2E build sets no
// COMMERCIAL_CONTACT_EMAIL, so "Contratar" is absent here (unit-tested set).

const EXHAUSTED =
  "As verificações do plano acabaram. Contrate para continuar verificando.";
const NONE = "Esta conta ainda não tem verificações liberadas.";

test.describe("plan states @feature-ops-panel @panel-lote @panel-phone", () => {
  test("below lg, Conta describes the menu with the plan variant above Sair", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "panel-desktop",
      "the sidebar's plan block covers 1280",
    );
    const email = uniqueEmail("conta-plano", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);

    await page
      .getByRole("banner")
      .getByRole("button", { name: "Conta" })
      .click();
    const menu = page.getByRole("menu", { name: "Conta" });
    await expect(menu).toHaveAccessibleDescription(
      "Plano Essencial 1.240 de 5.000 verificações neste ciclo Ciclo até 04/11/2026",
    );
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Configurações",
      "Sair",
    ]);
    await expect(
      page.getByRole("banner").getByText("Plano Essencial"),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Configurações" }),
    ).toBeFocused();

    await expectNoAxeViolations(page);
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("without a plano, Conta has its items only", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name === "panel-desktop", "below lg only");
    const email = uniqueEmail("conta-parcial", testInfo);
    await createAccount(request, email, "parcial");
    await logIn(page, email);

    await page
      .getByRole("banner")
      .getByRole("button", { name: "Conta" })
      .click();
    const menu = page.getByRole("menu", { name: "Conta" });
    await expect(menu).not.toHaveAttribute("aria-describedby");
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Configurações",
      "Sair",
    ]);
  });

  for (const [preset, text] of [
    ["esgotado", EXHAUSTED],
    ["semverificacoes", NONE],
  ] as const) {
    test(`/fila shows the plan banner under the heading (${preset}); not a live region; axe clean; no page scroll at 320`, async ({
      page,
      request,
    }, testInfo) => {
      const email = uniqueEmail(`banner-${preset}`, testInfo);
      await createAccount(request, email, preset);
      await logIn(page, email);
      await page.goto("/fila"); // M8 D1: login lands on Início

      const main = page.locator("main");
      const banner = main.getByText(text);
      await expect(banner).toBeVisible();
      // The Notice is the text's parent.
      const notice = banner.locator("xpath=..");
      await expect(notice).not.toHaveAttribute("role");
      // Not inside a live region (T110's empty "casos novos" status region
      // is present on /fila from first paint, by design; plan-m6 § 8).
      await expect(
        notice.locator(
          "xpath=ancestor-or-self::*[@role='status' or @role='alert' or @aria-live]",
        ),
      ).toHaveCount(0);
      await expect(main.getByRole("alert")).toHaveCount(0);
      // DDR-0003: a warning left bar, ink text (never amber).
      const style = await notice.evaluate((el) => {
        const s = getComputedStyle(el);
        return { bar: s.borderLeftWidth, color: s.color };
      });
      expect(style.bar).toBe("4px");
      const ink = await main
        .getByRole("heading", { level: 1 })
        .evaluate((el) => getComputedStyle(el).color);
      expect(style.color).toBe(ink);

      await expectNoAxeViolations(page);
      await page.setViewportSize({ width: 320, height: 700 });
      expect(await horizontalOverflow(page)).toBe(0);
    });
  }

  for (const preset of ["renata", "pago", "parcial"] as const) {
    test(`/fila has no plan banner with checks left or no plano (${preset})`, async ({
      page,
      request,
    }, testInfo) => {
      const email = uniqueEmail(`sem-banner-${preset}`, testInfo);
      await createAccount(request, email, preset);
      await logIn(page, email);

      const main = page.locator("main");
      await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(main.getByText(EXHAUSTED)).toHaveCount(0);
      await expect(main.getByText(NONE)).toHaveCount(0);
    });
  }
});
