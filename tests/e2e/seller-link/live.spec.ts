import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  CASE_TOKENS,
  SLUGS,
  cnpjFor,
  type CnpjScenario,
} from "../../fixtures/factories/seller-link.ts";

const MOCK_API = "http://localhost:4010"; // playwright.config.ts

/** Creates a case through the mock's D3, as the form would; it starts now. */
async function createCase(
  request: APIRequestContext,
  scenario: CnpjScenario,
): Promise<string> {
  const response = await request.post(
    `${MOCK_API}/public/v/${SLUGS.ok}/verify`,
    {
      headers: { "idempotency-key": crypto.randomUUID() },
      data: { cnpj: cnpjFor(scenario), responsavel: "Maria Exemplo" },
    },
  );
  return ((await response.json()) as { token: string }).token;
}

test.describe("live status @feature-seller-link", () => {
  test("AC 15 / AC 17 (S10): verificando at step 2, then em análise at 10 s from criado_em, with no navigation", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, "lento");
    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    // Survives only if the document is never reloaded.
    await page.evaluate(() => {
      (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
    });

    await expect(page.getByText("Passo 2 de 3")).toBeAttached();
    await expect(
      page.getByRole("heading", { level: 1, name: "Verificando sua empresa" }),
    ).toBeVisible();
    // The view's status line (the polite region says it too, T25).
    await expect(
      page.locator("p", {
        hasText: "Consultando Receita Federal, Simples Nacional e SINTEGRA…",
      }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(/^A consulta está demorando/)).toBeVisible();
    await expect(page.getByText(/^Este endereço também mostra/)).toBeVisible();
    await expect(page.getByText("Passo 2 de 3")).toBeAttached();
    // T25: the switch moves focus to the new h1 and announces it.
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeFocused();
    await expect(page.getByRole("status")).toHaveText(
      "Sua empresa está em análise",
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __sameDocument?: boolean }).__sameDocument,
      ),
    ).toBe(true);
  });

  test("AC 17: a reload after 10 s renders em análise directly", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.processing}`);

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeVisible();
    await expect(page.getByText(/^A consulta está demorando/)).toBeVisible();
    await expect(page.getByText("Verificando sua empresa")).toHaveCount(0);
  });

  test("AC 18 (S7): no company data shows analysis.body.notfound right away", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, "sem-dados");

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);

    await expect(page.getByText("Passo 2 de 3")).toBeAttached();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Ainda não encontramos os dados da sua empresa. Vamos conferir e avisar o resultado por e-mail.",
      ),
    ).toBeVisible();
  });
});
