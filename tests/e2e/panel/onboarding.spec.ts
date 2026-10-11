import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { MOCK_API } from "../fixtures/mock-api.ts";
import {
  LINK_URL,
  createAccount,
  horizontalOverflow,
  logIn,
  seed,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// S4 Começar (AC 4, the M4 half), T54. Pre-Contract: D-W2, D-W3.

test.describe("/comecar @feature-ops-panel @panel-access", () => {
  test("login with onboarding unfinished lands here: Passo 1 de 2, the contact choice, the backend's categories; axe clean; no scroll at 320", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("onb", testInfo);
    await createAccount(request, email, "nova");
    await logIn(page, email);

    await expect(page).toHaveURL(/\/comecar$/);
    await expect(page.getByText("Passo 1 de 2")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Como os vendedores falam com vocês",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("radiogroup", { name: "Canal de contato" }),
    ).toBeVisible();
    for (const name of [
      "Lojas de peças",
      "Oficinas e serviços",
      "Transportadoras",
    ])
      await expect(page.getByRole("radio", { name })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("validation: invalid e-mail, non-https URL, no category; focus on the first", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("onb-erros", testInfo);
    await createAccount(request, email, "nova");
    await logIn(page, email);
    await page.getByLabel("E-mail para vendedores").fill("x");
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByLabel("E-mail para vendedores")).toBeFocused();
    await expect(
      page.getByLabel("E-mail para vendedores"),
    ).toHaveAccessibleDescription("Informe um e-mail válido.");
    await expect(page.getByText("Escolha um tipo de vendedor.")).toBeVisible();

    await page.getByRole("radio", { name: "Página de ajuda" }).check();
    await page
      .getByLabel("Endereço da página de ajuda")
      .fill("http://ajuda.exemplo.test");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(
      page.getByLabel("Endereço da página de ajuda"),
    ).toHaveAccessibleDescription(
      /Informe um endereço que comece com https:\/\/\./,
    );
  });

  test("Continuar saves and lands on /lote?inicio=1 (step 2); revisiting /comecar goes home; the workspace is onboarded", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("onb-salva", testInfo);
    await createAccount(request, email, "nova");
    await logIn(page, email);
    await page.getByRole("radio", { name: "Página de ajuda" }).check();
    await page
      .getByLabel("Endereço da página de ajuda")
      .fill("https://ajuda.exemplo.test");
    await page.getByRole("radio", { name: "Transportadoras" }).check();
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page).toHaveURL(/\/lote\?inicio=1$/);
    const account = await (
      await request.get(`${MOCK_API}/__mock/panel/account?email=${email}`)
    ).json();
    expect(account.workspace).toMatchObject({
      onboarding_concluido: true,
      contato_vendedor: { tipo: "url", valor: "https://ajuda.exemplo.test" },
    });

    await page.goto("/comecar");
    await expect(page).not.toHaveURL(/\/comecar$/);
  });

  test("an (app) route with onboarding unfinished redirects here", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("onb-gate", testInfo);
    await createAccount(request, email, "nova");
    await logIn(page, email);
    await expect(page).toHaveURL(/\/comecar$/);

    // "/" is an (app) route (its gate: requireSession + onboarding).
    await page.goto("/");
    await expect(page).toHaveURL(/\/comecar$/);
  });

  test("categories failing: error.load.* with a working retry", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("onb-falha", testInfo);
    await createAccount(request, email, "nova");
    await seed(request, "categorias-falham", email);
    await logIn(page, email);

    await expect(
      page.getByRole("heading", { name: "Não carregou" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Não carregou" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Tentar de novo" }).click();
    // Still failing (the seed stays): the same state, not a crash.
    await expect(
      page.getByRole("heading", { name: "Não carregou" }),
    ).toBeFocused();
    // The retry re-mounts the boundary (and its <title>): let it settle.
    await page.waitForLoadState("networkidle");
    await expectNoAxeViolations(page);
  });

  test("without a session, /comecar goes to /entrar with volta", async ({
    page,
  }) => {
    await page.goto("/comecar");
    await expect(page).toHaveURL(/\/entrar\?volta=%2Fcomecar$/);
  });
});

// T78: onboarding step 2 on Lote and the template (J1.5, AC 4 Lote half, AC 14).
test.describe("onboarding step 2 and the template @feature-ops-panel @panel-lote", () => {
  test("?inicio=1 shows Passo 2 de 2 with Fazer depois → the home; without it, no banner", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("onb-passo2", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);

    await page.goto("/lote?inicio=1");
    const main = page.locator("main");
    await expect(main.getByText("Passo 2 de 2")).toBeVisible();
    await expect(
      main.getByRole("heading", {
        name: "Último passo: verifique a base que você já tem",
      }),
    ).toBeVisible();
    await expect(
      main.getByText(
        "Suba a planilha com os CNPJs dos seus vendedores. Leva poucos minutos.",
      ),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await main.getByRole("link", { name: "Fazer depois" }).click();
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/$/);

    await page.goto("/lote");
    await expect(page.locator("main").getByText("Passo 2 de 2")).toHaveCount(0);
  });

  test("Baixar modelo downloads the BOM + CNPJ;Responsável;ID na plataforma + CRLF as an attachment", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("modelo", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await page.goto("/lote");

    const link = page.getByRole("link", { name: "Baixar modelo" });
    await expect(link).toHaveAttribute("download", "");
    await expect(
      page.getByText(
        "Colunas: CNPJ (obrigatória), Responsável e ID na plataforma (opcionais).",
      ),
    ).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      link.click(),
    ]);
    expect(download.suggestedFilename()).toBe("kybr-modelo-lote.csv");

    const response = await page.request.get("/lote/modelo.csv");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers()["content-disposition"]).toBe(
      'attachment; filename="kybr-modelo-lote.csv"',
    );
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect([...(await response.body())]).toEqual([
      0xef,
      0xbb,
      0xbf,
      ...Buffer.from("CNPJ;Responsável;ID na plataforma\r\n", "utf8"),
    ]);
  });

  test("the template 404s on the link host", async ({ request }) => {
    const response = await request.get(`${LINK_URL}/lote/modelo.csv`);
    expect(response.status()).toBe(404);
    const internal = await request.get(`${LINK_URL}/painel/lote/modelo.csv`);
    expect(internal.status()).toBe(404);
  });
});
