import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  LINK_URL,
  callsFor,
  createAccount,
  expireSessions,
  horizontalOverflow,
  logIn,
  sessionCookie,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// S3 Entrar (AC 5, AC 7 banner), T50. Pre-Contract: D-A4 on the mock.

const PASSWORD = "senha-correta-123";
const TURNSTILE_PASS = "XXXX.DUMMY.TOKEN.XXXX";

/** Fills and submits the form, waiting for the action's answer. */
async function submit(page: Page, email: string, senha: string): Promise<void> {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    page.getByRole("button", { name: "Entrar" }).click(),
  ]);
}

test.describe("/entrar @feature-ops-panel @panel-access @panel-smoke @panel-phone", () => {
  test("wrong credentials: one message that names no field, focus on the e-mail", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("errada", testInfo);
    await createAccount(request, email);
    await page.goto("/entrar");
    await submit(page, email, "senha-errada-1");

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "E-mail ou senha incorretos.",
    );
    await expect(page.getByLabel("E-mail")).toBeFocused();
  });

  test("success lands on a safe volta, and a new login rotates the session cookie", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("volta", testInfo);
    await createAccount(request, email);
    await logIn(page, email, PASSWORD, "/entrar?volta=%2Ffila%3Faba%3Dx");
    await expect(page).toHaveURL(/\/fila\?aba=x$/);
    const first = await sessionCookie(page);

    // The old id stops working (a stale cookie); the next login replaces it.
    await expireSessions(request, email);
    await logIn(page, email);
    const second = await sessionCookie(page);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
  });

  for (const volta of [
    "//evil.example",
    "https://evil.example/x",
    "/\\evil.example",
    "/v/loja-exemplo",
  ]) {
    test(`an unsafe volta (${volta}) is ignored: home instead`, async ({
      page,
      request,
    }, testInfo) => {
      const email = uniqueEmail("externa", testInfo);
      await createAccount(request, email);
      await logIn(
        page,
        email,
        PASSWORD,
        `/entrar?volta=${encodeURIComponent(volta)}`,
      );

      await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/(fila)?$/);
    });
  }

  test("a valid session on /entrar goes straight on; a stale cookie doesn't loop", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("ja-logada", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    await page.goto("/entrar?volta=%2Ffila");
    await expect(page).toHaveURL(/\/fila$/);

    await page.context().clearCookies();
    await page.context().addCookies([
      {
        name: "kybr_session",
        value: "sessao-velha-0123456789",
        url: "http://127.0.0.1:3000",
      },
    ]);
    const response = await page.goto("/entrar");
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Entrar no Kybr" }),
    ).toBeVisible();
  });

  test("after 3 failures the API asks for Turnstile: the widget appears and the next submit carries its token", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("turnstile", testInfo);
    await createAccount(request, email);
    await page.goto("/entrar");
    for (let attempt = 0; attempt < 3; attempt++) {
      await submit(page, email, "senha-errada-1");
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(
        "E-mail ou senha incorretos.",
      );
    }
    await submit(page, email, PASSWORD);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "pedimos uma verificação extra",
    );

    // Cloudflare's always-pass test key: the widget solves itself.
    await expect(page.locator('input[name="turnstile"]')).toHaveValue(
      TURNSTILE_PASS,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/entrar"));

    const calls = await callsFor(request, email);
    expect(calls.at(-1)).toMatchObject({
      path: "/v1/auth/login",
      turnstile: TURNSTILE_PASS,
    });
  });

  test("a failed security check shows auth.error.turnstile + hint, and submitting stays possible", async ({
    page,
    request,
  }, testInfo) => {
    // Stand-in for Cloudflare's always-fail key: the widget calls error-callback.
    await page.route("https://challenges.cloudflare.com/**", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: "window.turnstile={render:function(el,o){setTimeout(function(){o['error-callback']()},0);return 'w'},reset:function(){},remove:function(){}};",
      }),
    );
    const email = uniqueEmail("falha", testInfo);
    await createAccount(request, email);
    await page.goto("/entrar");
    for (let attempt = 0; attempt < 4; attempt++)
      await submit(page, email, attempt < 3 ? "errada-123" : PASSWORD);

    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Não conseguimos fazer a verificação de segurança.",
    );
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "bloqueadores de anúncio",
    );
    await expect(page.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  test("429: auth.error.rate_limit with the minutes from Retry-After", async ({
    page,
  }) => {
    await page.goto("/entrar");
    await submit(page, "limite@exemplo.test", PASSWORD);

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Muitas tentativas seguidas. Tente de novo em 9 min.",
    );
  });

  test("an unconfirmed e-mail goes to /cadastro/confirmar (S2), with no PII in the URL", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("pendente", testInfo);
    await createAccount(request, email, "pendente");
    await page.goto("/entrar");
    await submit(page, email, PASSWORD);

    await expect(page).toHaveURL(/\/cadastro\/confirmar\?origem=login$/);
    expect(page.url()).not.toContain("exemplo.test");
  });

  test("a network drop: error.network, values kept", async ({ page }) => {
    await page.goto("/entrar");
    await submit(page, "queda@exemplo.test", "queda-de-rede");

    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
    );
    await expect(page.getByLabel("E-mail")).toHaveValue("queda@exemplo.test");
    await expect(page.getByLabel("Senha")).toHaveValue("queda-de-rede");
  });

  for (const [query, texts] of [
    [
      "motivo=sessao",
      ["Sua sessão expirou. Entre de novo para continuar de onde parou."],
    ],
    [
      "motivo=sessao&perdido=1",
      [
        "Sua sessão expirou.",
        "O que estava aberto num formulário não foi salvo.",
      ],
    ],
    ["motivo=saiu", ["Você saiu do painel."]],
    ["motivo=senha-nova", ["Senha alterada. Entre com a senha nova."]],
  ] as const) {
    test(`?${query} shows its banner, focused on load`, async ({ page }) => {
      await page.goto(`/entrar?${query}`);
      const banner = page.getByRole("status").filter({ hasText: texts[0] });

      for (const text of texts) await expect(banner).toContainText(text);
      await expect(banner).toBeFocused();
    });
  }

  test("a centered column of at most 440 px, no horizontal scroll at 320 px, axe clean in light and dark", async ({
    page,
  }) => {
    await page.goto("/entrar?motivo=sessao");
    const width = await page
      .locator("main")
      .evaluate((main) => main.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(440);
    await expectNoAxeViolations(page);

    await page.setViewportSize({ width: 320, height: 700 });
    expect(await horizontalOverflow(page)).toBe(0);
  });
});

test.describe("loginAction off the panel host @feature-ops-panel @panel-access", () => {
  test("posted to the link host it answers 404, with no API call (P03.2)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("host-errado", testInfo);
    await createAccount(request, email);
    await page.goto("/entrar");

    // Capture the real action request, then replay it against the link host.
    const captured = new Promise<{
      headers: Record<string, string>;
      body: string;
    }>((resolve) => {
      void page.route("**/entrar", async (route) => {
        const req = route.request();
        if (req.method() === "POST") {
          resolve({ headers: req.headers(), body: req.postData() ?? "" });
          await route.abort();
        } else await route.continue();
      });
    });
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();
    const { headers, body } = await captured;

    const response = await request.post(`${LINK_URL}/entrar`, {
      headers: {
        "next-action": headers["next-action"] ?? "",
        "content-type": headers["content-type"] ?? "text/plain;charset=UTF-8",
        accept: "text/x-component",
        origin: LINK_URL,
      },
      data: body,
    });
    expect(response.status()).toBe(404);
    expect(await callsFor(request, email)).toEqual([]);
  });
});
