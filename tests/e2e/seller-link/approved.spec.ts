import { expect, test } from "@playwright/test";

import {
  CASE_PRESETS,
  CASE_TOKENS,
  SLUGS,
  buildResponsavel,
} from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { createCase } from "../fixtures/mock-api.ts";

test.describe("tudo certo @feature-seller-link", () => {
  test("AC 19: S4 shows step 3, the seal, the first name, the rows, the query date and the way back", async ({
    page,
  }) => {
    const firstName = buildResponsavel(CASE_TOKENS.aprovado).split(" ")[0];

    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.aprovado}`);

    await expect(page.getByText("Passo 3 de 3")).toBeAttached();
    await expect(page.getByText("Vendedor verificado")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: `Tudo certo, ${firstName}.`,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/^A empresa .+ está liberada para vender\.$/),
    ).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveText([
      /Situação na Receita\s*ativa/,
      /Inscrição estadual\s*ativa \(SP\)/,
      /Responsável\s*confere/,
    ]);
    await expect(
      page.getByText("Dados consultados em 01/10/2026."),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Pode fechar esta página e voltar para o cadastro na plataforma Loja Exemplo.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.getByText(/outro CNPJ/i)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test("AC 19 (G12): only the rows returned, in spec order", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, CASE_PRESETS.approvedSubset);

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);

    await expect(page.getByRole("listitem")).toHaveText([
      /Situação na Receita\s*ativa/,
      /Responsável\s*confere/,
    ]);
  });

  test("AC 18: approved without company data uses approved.body.nodata and leaves out the query date", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.semDadosAprovado}`);

    await expect(page.getByText("Vendedor verificado")).toBeVisible();
    await expect(
      page.getByText("Sua empresa está liberada para vender."),
    ).toBeVisible();
    await expect(page.getByText(/Dados consultados/)).toHaveCount(0);
    await expect(page.getByText(/A empresa/)).toHaveCount(0);
    await expect(page.getByRole("listitem")).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});
