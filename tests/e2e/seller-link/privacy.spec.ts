import { expect, test } from "@playwright/test";

import { CASE_TOKENS, SLUGS } from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { uniqueKey } from "../fixtures/mock-api.ts";

// The privacy notice (spec AC 31; T32): reached from the form and the case
// page footers, filled with the marketplace's name, with a way back; and its
// partial state when the link info fails.

const H1 = "Como tratamos seus dados";

test.describe("privacy notice @feature-seller-link", () => {
  test("AC 31: from the form, the notice names the marketplace, and Voltar ao cadastro returns to the form", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}`);
    await expect(
      page.getByText("Usamos estes dados só para verificar sua empresa."),
    ).toBeVisible();

    await page.getByRole("link", { name: H1 }).click();

    await expect(page).toHaveURL(`/v/${SLUGS.ok}/privacidade`);
    await expect(
      page.getByRole("heading", { level: 1, name: H1 }),
    ).toBeVisible();
    await expect(page).toHaveTitle(H1);
    await expect(
      page.getByText(
        "Loja Exemplo decide como seus dados são usados neste cadastro (controladora). A Kybr faz a verificação em nome de Loja Exemplo (operadora).",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Falar com Loja Exemplo" }),
    ).toHaveAttribute("href", "mailto:vendedores@loja-exemplo.test");
    await expect(page.locator("main")).not.toContainText(/\{\w+\}/);
    await expectNoAxeViolations(page);

    await page.getByRole("link", { name: "Voltar ao cadastro" }).click();
    await expect(page).toHaveURL(`/v/${SLUGS.ok}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Cadastro de vendedor" }),
    ).toBeVisible();
  });

  test("AC 31: the case page shows the footer, and back from the notice returns to the case", async ({
    page,
  }) => {
    const casePath = `/v/${SLUGS.ok}/c/${CASE_TOKENS.aprovado}`;
    await page.goto(casePath);
    await expect(
      page.getByText("Usamos estes dados só para verificar sua empresa."),
    ).toBeVisible();

    await page.getByRole("link", { name: H1 }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: H1 }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Voltar ao cadastro" }).click();
    await expect(page).toHaveURL(casePath);
    await expect(
      page.getByRole("heading", { level: 1, name: /^Tudo certo, / }),
    ).toBeVisible();
  });

  test("opened directly (no page of ours behind it), Voltar ao cadastro goes to the link's form", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.other}/privacidade`);
    await expect(
      page.getByRole("link", {
        name: "Falar com Outra Loja (abre em outra aba)",
      }),
    ).toHaveAttribute("target", "_blank");

    await page.getByRole("link", { name: "Voltar ao cadastro" }).click();

    await expect(page).toHaveURL(`/v/${SLUGS.other}`);
  });

  test("AC 31 (partial, S3): the link info fails: the .fallback strings, no lower-case sentence start, no contact", async ({
    page,
  }, testInfo) => {
    // A per-test variant of the unstable link, so its D1 answer isn't cached.
    await page.goto(`/v/${uniqueKey(SLUGS.unstable, testInfo)}/privacidade`);

    await expect(
      page.getByRole("heading", { level: 1, name: H1 }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /^Quem decide como seus dados são usados neste cadastro é a plataforma/,
      ),
    ).toBeVisible();
    await expect(
      page.getByText(/enquanto a plataforma usar o serviço\.$/),
    ).toBeVisible();
    await expect(
      page.getByText(/fale com a plataforma onde você está se cadastrando\.$/),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^Falar com/ })).toHaveCount(0);
    for (const text of await page.locator("main p").allInnerTexts())
      expect(text).toMatch(/^\p{Lu}/u);
    await expectNoAxeViolations(page);
  });

  test("an unknown link's notice is Link not found", async ({ page }) => {
    await page.goto(`/v/${SLUGS.unknown}/privacidade`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Link não encontrado" }),
    ).toBeVisible();
  });

  test("loading: a skeleton of headings and paragraphs while the link info loads", async ({
    page,
  }, testInfo) => {
    // loja-lenta-<suffix> answers D1 after 1.5 s and misses the 60 s cache.
    await page.goto(`/v/${uniqueKey(SLUGS.slow, testInfo)}/privacidade`, {
      waitUntil: "commit",
    });

    await expect(page.locator('main [aria-busy="true"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: H1 }),
    ).toBeVisible();
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  });
});
