import { expect, test } from "@playwright/test";

test.describe("form screen @feature-seller-link", () => {
  test("AC 1: at 360 px it shows the name, h1, lead and privacy footer, with no Kybr mark", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/v/loja-exemplo");

    await expect(page.getByText("Loja Exemplo", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Cadastro de vendedor" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Leva menos de um minuto. Só precisamos do CNPJ e de quem é o responsável.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Usamos estes dados só para verificar sua empresa."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Como tratamos seus dados" }),
    ).toHaveAttribute("href", "/v/loja-exemplo/privacidade");
    expect(await page.locator("body").innerText()).not.toMatch(/kybr/i);
    await expect(page).toHaveTitle("Cadastro de vendedor");
  });

  test("AC 1: no favicon and never indexed", async ({ page }) => {
    await page.goto("/v/loja-exemplo");

    await expect(page.locator('link[rel~="icon"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex, nofollow/,
    );
  });

  test("the step indicator says Passo 1 de 3", async ({ page }) => {
    await page.goto("/v/loja-exemplo");

    await expect(page.getByText("Passo 1 de 3")).toBeAttached();
  });

  test("AC 1: no horizontal scroll at 320 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/v/loja-exemplo");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
