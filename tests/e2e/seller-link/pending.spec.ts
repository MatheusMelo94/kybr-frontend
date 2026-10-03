import { expect, test } from "@playwright/test";

import {
  CASE_PRESETS,
  CASE_TOKENS,
  SLUGS,
  buildResponsavel,
} from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { createCase } from "../fixtures/mock-api.ts";

// The fixed cases were created 2026-10-01T12:00Z; their deadline is two days
// later, 09:00 in Brasília.
const DEADLINE = "Prazo da análise: até 03/10, 09:00. Avisamos por e-mail.";

test.describe("quase lá @feature-seller-link", () => {
  test("AC 20 (S5): one row per item with its code's copy, the deadline and the query date last", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.pendente}`);

    await expect(page.getByText("Passo 3 de 3")).toBeAttached();
    await expect(
      page.getByRole("heading", { level: 1, name: "Quase lá" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /^Encontramos a empresa .+\. Falta pouco para liberar seu cadastro:$/,
      ),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      `${buildResponsavel(CASE_TOKENS.pendente)} não aparece entre os sócios da empresa`,
      "Inscrição estadual não encontrada",
      "Atividade registrada fora da categoria",
      "Empresa aberta há 3 dias",
    ]);
    await expect(
      page.getByRole("link", { name: "Como regularizar (abre em outra aba)" }),
    ).toHaveAttribute("target", "_blank");
    await expect(page.getByText(DEADLINE)).toBeVisible();
    await expect(
      page.getByText("Dados consultados em 01/10/2026."),
    ).toBeVisible();
    await expect(page.locator("main")).not.toContainText(
      /QSA|veredito|política|CNAE|DOCUMENTO_|_NAO_|_FORA_/,
    );
    await expectNoAxeViolations(page);
  });

  test("AC 20 (G10): every item code and every documento_tipo has its copy", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, CASE_PRESETS.pendingCatalogue);

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);

    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Maria Exemplo Silva não aparece entre os sócios da empresa",
      "Contrato social ou CCMEI",
      "Procuração do responsável",
      "Comprovante de endereço da empresa",
      "Cartão CNPJ atualizado",
      "Contrato social ou procuração",
      "Inscrição estadual não encontrada",
      "Inscrição estadual suspensa",
      "Empresa baixada na Receita Federal",
      "Atividade registrada fora da categoria",
      "Empresa aberta há 1 dia",
      "Empresa aberta há 12 dias",
      "Empresa MEI",
    ]);
    await expect(
      page.getByRole("link", { name: "Como regularizar (abre em outra aba)" }),
    ).toHaveCount(2);
    await expect(page.locator("main")).not.toContainText(
      /QSA|veredito|política|CNAE|DOCUMENTO_|_NAO_|_FORA_/,
    );
    await expectNoAxeViolations(page);
  });

  test("AC 23 (S14): every requested document received replaces the deadline", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.allReceived}`);

    await expect(
      page.getByText(
        "Recebemos tudo. Agora é com a gente: avisamos por e-mail até 03/10, 09:00.",
      ),
    ).toBeVisible();
    await expect(page.getByText(DEADLINE)).toHaveCount(0);
    await expect(
      page.getByText("Dados consultados em 01/10/2026."),
    ).toBeVisible();
  });

  test("AC 18 (S7): a document requested without company data uses pending.body.nodata and no query date", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.semDadosDocumento}`);

    await expect(
      page.getByText("Falta pouco para liberar seu cadastro:", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Contrato social ou CCMEI" }),
    ).toBeVisible();
    await expect(page.getByText(/Encontramos a empresa/)).toHaveCount(0);
    await expect(page.getByText(/Dados consultados/)).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});
