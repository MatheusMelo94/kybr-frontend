import { expect, test } from "@playwright/test";

import {
  createAccount,
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
    await page.goto("/?aba=x");

    await expireSessions(request, email);
    await page.reload();
    await expect(page).toHaveURL(
      /\/entrar\?motivo=sessao&volta=%2F%3Faba%3Dx$/,
    );
    await expect(
      page.getByRole("status").filter({ hasText: "Sua sessão expirou." }),
    ).toBeFocused();

    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("senha-correta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/\?aba=x$/);
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
    await page.goto("/?real=1");
    await expect(page).toHaveURL(
      /\/entrar\?motivo=sessao&volta=%2F%3Freal%3D1$/,
    );
  });

  test("the shell's poller hitting a 401 takes the same path, once", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("poller", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
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

    await expect(page).toHaveURL(/\/entrar\?motivo=sessao&volta=%2F$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Sua sessão expirou." }),
    ).toBeVisible();
    expect(logins).toHaveLength(1);
  });
});
