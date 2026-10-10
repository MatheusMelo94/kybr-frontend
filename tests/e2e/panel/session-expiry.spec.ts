import { expect, test } from "@playwright/test";

import {
  createAccount,
  createBatch,
  expireSessions,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// AC 7, ADR-0009 rule 7, T59. PA12: /__mock/panel/expire-session.

test.describe("session expiry mid-task @feature-ops-panel @panel-access", () => {
  test("a 401 on a page read → /entrar?motivo=sessao&volta=<current> with session.expired; logging in returns there", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("expira", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    await page.goto("/fila?aba=x");

    await expireSessions(request, email);
    await page.reload();
    await expect(page).toHaveURL(
      /\/entrar\?motivo=sessao&volta=%2Ffila%3Faba%3Dx$/,
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Sua sessão expirou." }),
    ).toBeFocused();

    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("senha-correta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/fila\?aba=x$/);
  });

  test("a client-sent x-kybr-panel-path never becomes volta (T47's deferred check)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("forjado", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    await expireSessions(request, email);

    await page.setExtraHTTPHeaders({ "x-kybr-panel-path": "/fila/forjado" });
    await page.goto("/fila?real=1");
    await expect(page).toHaveURL(
      /\/entrar\?motivo=sessao&volta=%2Ffila%3Freal%3D1$/,
    );
  });

  test("the shell's poller hitting a 401 takes the same path, once", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("poller", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    // M8 D1: login lands on Início; this test is about the Fila.
    await page.goto("/fila");
    await expect(page).toHaveURL(/\/fila$/);
    await expect(
      page.getByRole("navigation", { name: "Navegação do painel" }).first(),
    ).toBeAttached();

    // Document loads of /entrar (a same-document history update isn't one).
    const logins: string[] = [];
    page.on("request", (req) => {
      if (req.isNavigationRequest() && req.url().includes("/entrar"))
        logins.push(req.url());
    });
    await expireSessions(request, email);
    // Becoming visible fires one poll (ADR-0011 rule 3).
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );

    await expect(page).toHaveURL(/\/entrar\?motivo=sessao&volta=%2Ffila$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Sua sessão expirou." }),
    ).toBeVisible();
    expect(logins).toHaveLength(1);
  });
});

// T118 (ADR-0011 Addendum 2): the M4/M5 session actions return
// SESSAO_EXPIRADA and the leaf sends Renata to /entrar, exactly as before
// (no dialog draft, so no perdido). Security's regression: the M4 shell
// poll above, and an M5 action here.
test.describe("session expiry in a Server Action (T118) @feature-ops-panel @panel-access @panel-lote", () => {
  test("an onboarding save with the session gone ends on /entrar?motivo=sessao&volta=%2Fcomecar, no perdido", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("t118-onb", testInfo);
    await createAccount(request, email, "nova");
    await logIn(page, email);
    await expect(page).toHaveURL(/\/comecar$/);
    await page
      .getByLabel("E-mail para vendedores")
      .fill("suporte@exemplo.test");
    await page.getByRole("radio", { name: "Lojas de peças" }).check();
    await expireSessions(request, email);
    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page).toHaveURL(/\/entrar\?motivo=sessao&volta=%2Fcomecar$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Sua sessão expirou." }),
    ).toBeVisible();
  });

  test("a batch poll (pollBatchAction) with the session gone ends on /entrar?motivo=sessao&volta=%2Flote%2F{id}, no perdido", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("t118-lote", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { hold: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expireSessions(request, email);

    await expect(page).toHaveURL(
      new RegExp(`/entrar\\?motivo=sessao&volta=%2Flote%2F${id}$`),
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Sua sessão expirou." }),
    ).toBeVisible();
  });
});
