import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  PANEL_URL,
  callsFor,
  createAccount,
  horizontalOverflow,
  logIn,
  seed,
  signupsFor,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// S1 Cadastro (AC 1, AC 2), T51. Pre-Contract: D-A1 on the mock.

const TURNSTILE_PASS = "XXXX.DUMMY.TOKEN.XXXX";

async function fill(
  page: Page,
  email: string,
  senha = "uma-senha-segura-1",
): Promise<void> {
  await page.getByLabel("Seu nome").fill("Pessoa Exemplo");
  await page.getByLabel("Nome da plataforma").fill("Plataforma Exemplo");
  await page.getByLabel("E-mail de trabalho").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("checkbox").check();
  // Cloudflare's always-pass test key: the widget solves itself.
  await expect(page.locator('input[name="turnstile"]')).toHaveValue(
    TURNSTILE_PASS,
    { timeout: 20_000 },
  );
}

async function submit(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    ),
    page.getByRole("button", { name: "Criar conta" }).click(),
  ]);
}

const formAlert = (page: Page) => page.getByRole("main").getByRole("alert");

test.describe("/cadastro @feature-ops-panel @panel-access @panel-phone", () => {
  test("Q10: a valid session on /cadastro goes home, like /entrar", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("ja-logada-cadastro", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    await page.goto("/cadastro");
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/$/);
  });

  test("AC 1: four labeled fields, the terms with two new-tab links, Criar conta, Já tem conta; no horizontal scroll at 320; axe clean", async ({
    page,
  }) => {
    await page.goto("/cadastro");

    for (const label of [
      "Seu nome",
      "Nome da plataforma",
      "E-mail de trabalho",
      "Senha",
    ])
      await expect(page.getByLabel(label)).toBeVisible();
    for (const name of [
      "Termos de uso (abre em outra aba)",
      "Política de privacidade (abre em outra aba)",
    ])
      await expect(page.getByRole("link", { name })).toHaveAttribute(
        "target",
        "_blank",
      );
    await expect(
      page.getByRole("button", { name: "Criar conta" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Já tem conta? Entrar" }),
    ).toHaveAttribute("href", "/entrar");
    await expectNoAxeViolations(page);

    await page.setViewportSize({ width: 320, height: 800 });
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("AC 2: submitting empty shows each error on its field, focus on the first", async ({
    page,
  }) => {
    await page.goto("/cadastro");
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(page.getByLabel("Seu nome")).toBeFocused();
    await expect(page.getByLabel("Seu nome")).toHaveAccessibleDescription(
      "Informe seu nome.",
    );
    await expect(page.getByLabel("Senha")).toHaveAccessibleDescription(
      /A senha precisa ter pelo menos 12 caracteres\./,
    );
    await expect(page.getByRole("checkbox")).toHaveAccessibleDescription(
      "Para criar a conta, aceite os termos e a política de privacidade.",
    );
  });

  test("success: one account for a double tap, the sign-up cookie without the password, S2 with no PII in the URL", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("cadastro", testInfo);
    await page.goto("/cadastro");
    await fill(page, email);
    await page.getByRole("button", { name: "Criar conta" }).dblclick();

    await expect(page).toHaveURL(/\/cadastro\/confirmar$/);
    expect(page.url()).not.toContain("exemplo.test");
    expect(await signupsFor(request, email)).toBe(1);
    const calls = await callsFor(request, email);
    expect(calls).toEqual([
      expect.objectContaining({
        path: "/v1/auth/signup",
        turnstile: TURNSTILE_PASS,
      }),
    ]);

    const cookie = (await page.context().cookies(PANEL_URL)).find(
      (c) => c.name === "kybr_signup",
    );
    expect(cookie?.httpOnly).toBe(true);
    const decoded = Buffer.from(cookie?.value ?? "", "base64url").toString(
      "utf8",
    );
    expect(decoded).toContain(email);
    expect(decoded).not.toContain("uma-senha-segura-1");
  });

  test("409: the e-mail-taken message with working Entrar and Recuperar senha", async ({
    page,
  }) => {
    await page.goto("/cadastro");
    await fill(page, "existente@exemplo.test");
    await submit(page);

    await expect(formAlert(page)).toContainText(
      "Já existe uma conta com este e-mail. Entre ou recupere a senha.",
    );
    await formAlert(page)
      .getByRole("link", { name: "Recuperar senha" })
      .click();
    await expect(page).toHaveURL(/\/senha\/esqueci$/);
  });

  test("a breached password: auth.error.password_breached on the password field", async ({
    page,
  }, testInfo) => {
    await page.goto("/cadastro");
    await fill(page, uniqueEmail("vazada", testInfo), "senhasenhasenha");
    await submit(page);

    await expect(page.getByLabel("Senha")).toHaveAccessibleDescription(
      /Esta senha aparece em vazamentos de dados conhecidos/,
    );
    await expect(page.getByLabel("Senha")).toBeFocused();
  });

  for (const [name, arrange, email, text] of [
    [
      "429",
      async () => {},
      "limite@exemplo.test",
      "Muitas tentativas seguidas. Tente de novo em 9 min.",
    ],
    [
      "trial unavailable",
      async () => {},
      "x@descartavel.test",
      "Não conseguimos liberar o teste grátis para este e-mail.",
    ],
    ["trial paused", "pausado", null, "Os testes grátis estão pausados agora."],
    [
      "a network drop",
      async () => {},
      "queda@exemplo.test",
      "Não conseguimos falar com o servidor.",
    ],
  ] as const) {
    test(`${name}: the form alert says so, values kept`, async ({
      page,
      request,
    }, testInfo) => {
      const address = email ?? uniqueEmail("pausado", testInfo);
      if (arrange === "pausado") await seed(request, "teste-pausado", address);
      await page.goto("/cadastro");
      await fill(
        page,
        address,
        name === "a network drop" ? "queda-de-rede" : "uma-senha-segura-1",
      );
      await submit(page);

      await expect(formAlert(page)).toContainText(text);
      await expect(page.getByLabel("E-mail de trabalho")).toHaveValue(address);
      await expect(page.getByLabel("Seu nome")).toHaveValue("Pessoa Exemplo");
    });
  }

  test("a failed security check: auth.error.turnstile + hint, Criar conta stays enabled", async ({
    page,
  }, testInfo) => {
    await page.route("https://challenges.cloudflare.com/**", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: "window.turnstile={render:function(el,o){setTimeout(function(){o['error-callback']()},0);return 'w'},reset:function(){},remove:function(){}};",
      }),
    );
    await page.goto("/cadastro");
    await expect(formAlert(page)).toContainText(
      "Não conseguimos fazer a verificação de segurança.",
    );
    await page.getByLabel("Seu nome").fill("Pessoa");
    await page.getByLabel("Nome da plataforma").fill("P");
    await page
      .getByLabel("E-mail de trabalho")
      .fill(uniqueEmail("sem-token", testInfo));
    await page.getByLabel("Senha").fill("uma-senha-segura-1");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Criar conta" }).click();

    await expect(formAlert(page)).toContainText("bloqueadores de anúncio");
    await expect(
      page.getByRole("button", { name: "Criar conta" }),
    ).toBeEnabled();
  });
});
