import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

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
  slug: string = SLUGS.ok,
): Promise<string> {
  const response = await request.post(`${MOCK_API}/public/v/${slug}/verify`, {
    headers: { "idempotency-key": crypto.randomUUID() },
    data: { cnpj: cnpjFor(scenario), responsavel: "Maria Exemplo" },
  });
  return ((await response.json()) as { token: string }).token;
}

/** Records when each status check (a Server Action POST) leaves the page. */
function recordChecks(page: Page): number[] {
  const sent: number[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.headers()["next-action"])
      sent.push(Date.now());
  });
  return sent;
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

  test("AC 16 (S4): the result shows within 10 s, focused and announced", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, "aprovado");

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Verificando sua empresa" }),
    ).toBeVisible();

    const result = page.getByRole("heading", {
      level: 1,
      name: "Tudo certo, Maria.",
    });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await expect(result).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("Tudo certo, Maria.");
    await expect(page.getByText("Passo 3 de 3")).toBeAttached();
  });

  test("AC 15 / AC 17 (S10): checks every 2 s while verifying; the result that arrives during em análise replaces it, announced", async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    const token = await createCase(request, "lento");
    const checks = recordChecks(page);

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeVisible({ timeout: 12_000 });
    const whileVerifying = [...checks];

    // S10 is approved at about 14 s; on em análise the next check is ≤ 10 s away.
    const result = page.getByRole("heading", {
      level: 1,
      name: "Tudo certo, Maria.",
    });
    await expect(result).toBeVisible({ timeout: 25_000 });
    await expect(result).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("Tudo certo, Maria.");

    expect(whileVerifying.length).toBeGreaterThanOrEqual(3);
    for (const [index, sentAt] of whileVerifying.entries()) {
      if (index === 0) continue;
      const gap = sentAt - (whileVerifying[index - 1] ?? sentAt);
      expect(gap).toBeGreaterThan(1_500);
      expect(gap).toBeLessThan(3_500);
    }
  });

  test("AC 17: a CASO_NAO_ENCONTRADO check refreshes to Case not found", async ({
    page,
    request,
  }, testInfo) => {
    const slug = `${SLUGS.perTest}-${testInfo.project.name}-${Math.random().toString(36).slice(2, 8)}`;
    const token = await createCase(request, "lento", slug);

    await page.goto(`/v/${slug}/c/${token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Verificando sua empresa" }),
    ).toBeVisible();
    // D4 now answers 404 for this link's cases.
    await request.post(`${MOCK_API}/__mock/links/${slug}/disable`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Cadastro não encontrado" }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("AC 39: 12.ABC.345/01DE-35 (S16) goes from the form through verificando to tudo certo", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}`);
    await page
      .getByRole("textbox", { name: "CNPJ da empresa" })
      .pressSequentially("12abc34501de35");
    await page
      .getByRole("textbox", { name: "Nome completo do responsável" })
      .fill("Maria Exemplo");
    await expect(page.getByTestId("company-block")).not.toHaveAttribute(
      "aria-busy",
    );
    await page.getByRole("button", { name: "Verificar empresa" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Verificando sua empresa" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Tudo certo, Maria." }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
