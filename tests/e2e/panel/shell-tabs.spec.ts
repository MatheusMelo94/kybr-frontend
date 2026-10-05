import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  createAccount,
  horizontalOverflow,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// S5 Shell below lg (AC 10), T56. Runs on panel-768, panel-360, panel-webkit-360.

test.describe("shell below lg @feature-ops-panel @panel-access @panel-phone", () => {
  test("a top bar with the workspace and Conta, a tab row with every label; no sidebar; no page scroll at 320; axe clean", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "panel-desktop",
      "the 1280 shell is shell.spec.ts",
    );
    const email = uniqueEmail("abas", testInfo);
    await createAccount(request, email);
    await logIn(page, email);

    await expect(page.locator("aside")).toBeHidden();
    const header = page.getByRole("banner");
    await expect(header.getByText("Loja Exemplo")).toBeVisible();
    await expect(header.getByRole("button", { name: "Conta" })).toBeVisible();
    const tab = header
      .getByRole("navigation", { name: "Navegação do painel" })
      .getByRole("link", {
        name: /^Fila de revisão/,
      });
    await expect(tab).toBeVisible();
    await expect(tab).toHaveText(/Fila de revisão/);

    const box = await tab.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const menu = await header
      .getByRole("button", { name: "Conta" })
      .boundingBox();
    expect(menu?.height ?? 0).toBeGreaterThanOrEqual(44);

    await header.getByRole("button", { name: "Conta" }).click();
    await expect(page.getByRole("menuitem", { name: "Sair" })).toBeVisible();
    await page.keyboard.press("Escape");

    await expectNoAxeViolations(page);
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await horizontalOverflow(page)).toBe(0);
  });
});
