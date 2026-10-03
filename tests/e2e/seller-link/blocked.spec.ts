import { expect, test } from "@playwright/test";

import { CASE_TOKENS, SLUGS } from "../../fixtures/factories/seller-link.ts";

test.describe("não aprovado @feature-seller-link", () => {
  test("AC 25 (S6): the inapta reason, the Receita CTA in a new tab and the contact CTA", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.bloqueado}`);

    await expect(page.getByText("Passo 3 de 3")).toBeAttached();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Não conseguimos aprovar seu cadastro",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /^A empresa .+ consta como inapta na Receita Federal\. Regularize a situação e volte a este link: ele continua valendo\.$/,
      ),
    ).toBeVisible();

    const receita = page.getByRole("link", {
      name: "Regularizar na Receita Federal (abre em outra aba)",
    });
    await expect(receita).toHaveAttribute("target", "_blank");
    await expect(receita).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      new URL((await receita.getAttribute("href")) ?? "").hostname,
    ).toMatch(/(^|\.)gov\.br$/);

    await expect(
      page.getByRole("link", { name: "Falar com Loja Exemplo" }),
    ).toHaveAttribute("href", "mailto:vendedores@loja-exemplo.test");
    await expect(
      page.getByText("Dados consultados em 01/10/2026."),
    ).toBeVisible();
  });

  test("S15: a case decided by ops after quase lá shows the GENERICO reason", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.decided}`);

    await expect(
      page.getByText("Para saber como seguir, fale com Loja Exemplo."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /regularizar/i })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("link", { name: "Falar com Loja Exemplo" }),
    ).toBeVisible();
  });
});
