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

  test("spec § Responsive (360): fields and the button are 48 px high, and every target is at least 44 px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/v/loja-exemplo");

    for (const control of [
      page.getByRole("textbox", { name: "CNPJ da empresa" }),
      page.getByRole("textbox", { name: "Nome completo do responsável" }),
      page.getByRole("button", { name: "Verificar empresa" }),
    ])
      expect((await control.boundingBox())?.height).toBe(48);
    const privacy = await page
      .getByRole("link", { name: "Como tratamos seus dados" })
      .boundingBox();
    expect(privacy?.height).toBeGreaterThanOrEqual(44);
    expect(privacy?.width).toBeGreaterThanOrEqual(44);
  });

  test("AC 1: no favicon and never indexed", async ({ page }) => {
    await page.goto("/v/loja-exemplo");

    await expect(page.locator('link[rel~="icon"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex, nofollow/,
    );
  });

  test("AC 1: /favicon.ico answers an empty 204, not a 404", async ({
    request,
  }) => {
    const response = await request.get("/favicon.ico");

    expect(response.status()).toBe(204);
    expect(await response.body()).toHaveLength(0);
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
