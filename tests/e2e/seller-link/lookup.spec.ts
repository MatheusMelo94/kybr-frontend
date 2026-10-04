import { expect, test, type Page } from "@playwright/test";

import {
  LONG_NAME_CNPJ,
  LONG_RAZAO_SOCIAL,
  MEI_CNPJS,
  buildCompany,
  cnpjFor,
} from "../../fixtures/factories/seller-link.ts";

async function typeCnpj(page: Page, cnpj: string): Promise<void> {
  await page
    .getByRole("textbox", { name: "CNPJ da empresa" })
    .pressSequentially(cnpj);
}

test.describe("CNPJ lookup @feature-seller-link", () => {
  test("AC 7: an alphanumeric CNPJ is looked up once, and the company block shows name, activity and city", async ({
    page,
  }) => {
    const actionPosts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"])
        actionPosts.push(request.url());
    });
    await page.goto("/v/loja-exemplo");
    const company = buildCompany("12ABC34501DE35");

    await typeCnpj(page, "12abc34501de35");

    const block = page.getByTestId("company-block");
    await expect(block).toContainText(company.razao_social);
    await expect(block).toContainText(
      `Atividade principal: ${company.cnae.descricao}`,
    );
    await expect(block).toContainText(`${company.municipio}, ${company.uf}`);
    // One period, even after a name that ends with one (review 0016).
    await expect(page.getByRole("status")).toHaveText(
      `Empresa encontrada: ${company.razao_social.replace(/\.?$/, ".")}`,
    );
    expect(actionPosts).toHaveLength(1);
  });

  test("AC 7 / QA C04 (review 0016): a name ending in Ltda. is announced with one period", async ({
    page,
  }) => {
    await page.goto("/v/loja-exemplo");

    await typeCnpj(page, LONG_NAME_CNPJ);

    await expect(page.getByRole("status")).toHaveText(
      `Empresa encontrada: ${LONG_RAZAO_SOCIAL}`,
    );
  });

  test("AC 7 (S18): a CPF in the name shows masked even when the API sent it unmasked", async ({
    page,
  }) => {
    await page.goto("/v/loja-exemplo");

    await typeCnpj(page, MEI_CNPJS.unmasked);

    await expect(page.getByText("***.***.***-**")).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(
      "Empresa encontrada: JOAO CARLOS SILVA CPF oculto.",
    );
    expect(await page.content()).not.toContain("12345678909");
  });

  test("AC 8: not found shows its note and keeps submit enabled", async ({
    page,
  }) => {
    await page.goto("/v/loja-exemplo");

    await typeCnpj(page, cnpjFor("sem-dados"));

    await expect(
      page.locator("p", {
        hasText:
          "Ainda não encontramos os dados dessa empresa. Você pode continuar: vamos conferir com calma.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Verificar empresa" }),
    ).toBeEnabled();
  });

  test("AC 9: a rate-limited lookup shows the failed note and keeps submit enabled", async ({
    page,
  }) => {
    await page.goto("/v/loja-exemplo");

    await typeCnpj(page, cnpjFor("limite-consulta"));

    await expect(
      page.locator("p", {
        hasText:
          "Não conseguimos buscar os dados da empresa agora. Você pode continuar mesmo assim.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Verificar empresa" }),
    ).toBeEnabled();
  });
});
