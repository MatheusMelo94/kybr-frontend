import { expect, test, type Page } from "@playwright/test";

import {
  createAccount,
  horizontalOverflow,
  logIn,
  seed,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T144: Regras (S11, AC 59 first half, plan-m8 D8): the rules with their
// selects, the days, the document switches, the save bar only while dirty,
// Descartar, the nodocs validation, the Switch by keyboard, the load error.

const NODOCS = 'Ative pelo menos um documento para usar "Pedir documento".';

const content = (page: Page) => page.locator("#conteudo");
const saveBar = (page: Page) =>
  content(page).getByRole("region", { name: "Salvar regras" });

async function openRegras(page: Page, email: string): Promise<void> {
  await logIn(page, email);
  await page
    .getByRole("navigation", { name: "Navegação do painel" })
    .getByRole("link", { name: "Regras" })
    .click();
  await page.waitForURL(/\/regras$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Regras de aprovação" }),
  ).toBeVisible();
}

test.describe("Regras @feature-ops-panel @panel-operacao @panel-regras @panel-phone", () => {
  test("AC 59: the rules in order with their selects; the save bar only while dirty; Descartar", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    await expect(page).toHaveTitle("Regras de aprovação · Kybr");
    await expect(
      content(page).getByText(/^O que acontece com cada resultado para .+\.$/),
    ).toBeVisible();
    const selects = content(page).getByRole("combobox");
    await expect(selects).toHaveCount(7);
    await expect(selects.last()).toHaveAccessibleName("Tudo certo");
    await expect(
      content(page).getByRole("textbox", { name: "Prazo mínimo de abertura" }),
    ).toHaveValue("180");
    await expect(content(page).getByRole("switch")).toHaveCount(5);
    await expect(saveBar(page)).toHaveCount(0);

    const situacao = content(page).getByRole("combobox", {
      name: "Empresa inapta, baixada ou suspensa",
    });
    await situacao.selectOption("review");
    await expect(saveBar(page)).toBeVisible();
    await situacao.selectOption("block");
    await expect(saveBar(page)).toHaveCount(0);

    await situacao.selectOption("review");
    await saveBar(page).getByRole("button", { name: "Descartar" }).click();
    await expect(saveBar(page)).toHaveCount(0);
    await expect(situacao).toHaveValue("block");
  });

  test("Pedir documento with no document: nodocs by the card and the rule, focus on the rule", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-nodocs", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    const switches = content(page).getByRole("switch");
    for (let i = 0; i < (await switches.count()); i++) {
      const toggle = switches.nth(i);
      if ((await toggle.getAttribute("aria-checked")) === "true")
        await toggle.click();
    }
    await saveBar(page).getByRole("button", { name: "Salvar regras" }).click();
    const qsa = content(page).getByRole("combobox", {
      name: "Responsável não consta no quadro de sócios",
    });
    await expect(qsa).toBeFocused();
    await expect(qsa).toHaveAccessibleDescription(
      /Ative pelo menos um documento/,
    );
    await expect(
      content(page)
        .getByRole("region", { name: "Documentos que o link pode pedir" })
        .getByText(NODOCS),
    ).toBeVisible();
  });

  test("a Switch flips with Space; it's a switch with its label as the name", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-switch", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    const toggle = content(page).getByRole("switch").first();
    const before = await toggle.getAttribute("aria-checked");
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute(
      "aria-checked",
      before === "true" ? "false" : "true",
    );
    await expect(saveBar(page)).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("a failed load: error.load.*", async ({ page, request }, testInfo) => {
    const email = uniqueEmail("regras-falha", testInfo);
    await createAccount(request, email);
    await seed(request, "regras-falha", email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fregras");
    await expect(
      content(page).getByRole("button", { name: "Tentar de novo" }),
    ).toBeVisible();
  });
});
