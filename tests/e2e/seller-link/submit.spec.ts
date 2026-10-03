import { expect, test, type Page } from "@playwright/test";

import { cnpjFor } from "../../fixtures/factories/seller-link.ts";

const MOCK_API = "http://localhost:4010"; // playwright.config.ts
const CASE_URL = /\/v\/loja-exemplo\/c\/[A-Za-z0-9_-]{22,64}$/;

async function fill(
  page: Page,
  cnpj: string,
  name = "Maria Exemplo",
): Promise<void> {
  await page
    .getByRole("textbox", { name: "CNPJ da empresa" })
    .pressSequentially(cnpj);
  await page
    .getByRole("textbox", { name: "Nome completo do responsável" })
    .fill(name);
}

test.describe("submit @feature-seller-link", () => {
  test("AC 12 / AC 39: an alphanumeric CNPJ submits once, even on a double tap, and opens the case", async ({
    page,
  }) => {
    const actionPosts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"])
        actionPosts.push(request.url());
    });
    await page.goto("/v/loja-exemplo?ref=onboarding&ext_id=SELLER-42");
    await fill(page, "12abc34501de35");
    await expect(page.getByTestId("company-block")).not.toHaveAttribute(
      "aria-busy",
    );
    const lookups = actionPosts.length;

    await page.getByRole("button", { name: "Verificar empresa" }).dblclick();

    await expect(page).toHaveURL(CASE_URL);
    expect(actionPosts.length - lookups).toBe(1);
  });

  test("AC 13: offline shows the network alert and keeps the values; back online, tapping again succeeds", async ({
    page,
    context,
  }) => {
    await page.goto("/v/loja-exemplo");
    await fill(page, cnpjFor("aprovado"));
    await expect(page.getByTestId("company-block")).not.toHaveAttribute(
      "aria-busy",
    );

    await context.setOffline(true);
    await page.getByRole("button", { name: "Verificar empresa" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "Não conseguimos enviar. Confira sua conexão e tente de novo.",
    );
    await expect(
      page.getByRole("textbox", { name: "CNPJ da empresa" }),
    ).toHaveValue("12.345.678/0001-95");
    await expect(
      page.getByRole("textbox", { name: "Nome completo do responsável" }),
    ).toHaveValue("Maria Exemplo");

    await context.setOffline(false);
    await page.getByRole("button", { name: "Verificar empresa" }).click();
    await expect(page).toHaveURL(CASE_URL);
  });

  test.describe("AC 14: rate limits", () => {
    for (const [scenario, message] of [
      [
        "limite-cnpj",
        "Esse CNPJ já foi verificado várias vezes na última hora. Tente de novo em 9 min.",
      ],
      ["limite-geral", "Muitas tentativas seguidas. Tente de novo em 9 min."],
    ] as const) {
      test(`${scenario} shows its alert with minutes from Retry-After`, async ({
        page,
      }) => {
        await page.goto("/v/loja-exemplo");
        await fill(page, cnpjFor(scenario));

        await page.getByRole("button", { name: "Verificar empresa" }).click();

        await expect(page.locator("form").getByRole("alert")).toHaveText(
          message,
        );
      });
    }
  });

  test("AC 14: a link disabled before submit re-renders as Link not found", async ({
    page,
    request,
  }, testInfo) => {
    const slug = `loja-teste-${testInfo.project.name}-${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(`/v/${slug}`);
    await fill(page, cnpjFor("aprovado"));
    await request.post(`${MOCK_API}/__mock/links/${slug}/disable`);

    await page.getByRole("button", { name: "Verificar empresa" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Link não encontrado" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });
});
