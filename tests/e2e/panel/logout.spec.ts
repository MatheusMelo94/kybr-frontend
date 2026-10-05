import { expect, test } from "@playwright/test";

import { MOCK_API } from "../fixtures/mock-api.ts";
import {
  createAccount,
  logIn,
  logoutsFor,
  sessionCookie,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// AC 8, P15, T58. Pre-Contract: D-A4 logout.

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Sair @feature-ops-panel @panel-access @panel-smoke", () => {
  test("a POST that revokes the session, deletes the cookie and redirects from the server to /entrar, dropping the router cache; Back never shows the shell; the old token gets 401", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("sair", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    const shellUrl = page.url();
    const oldToken = await sessionCookie(page);
    expect(oldToken).toBeTruthy();

    // Panel HTML is never cached.
    const shell = await page.request.get(shellUrl);
    expect(shell.headers()["cache-control"]).toMatch(/\bno-store\b/);

    const logoutResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    );
    await page.getByRole("button", { name: "Conta" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    const response = await logoutResponse;
    expect(response.request().method()).toBe("POST");
    // The server picks the destination; the cookie flag (the tuple's third
    // element) makes the client router drop its whole cache.
    expect(await response.headerValue("x-action-redirect")).toMatch(
      /^\/entrar\?motivo=saiu;/,
    );
    expect(
      JSON.parse((await response.headerValue("x-action-revalidated")) ?? "[]"),
    ).toEqual([[], 0, 1]);

    await expect(page).toHaveURL(/\/entrar\?motivo=saiu$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Você saiu do painel." }),
    ).toBeFocused();
    expect(await sessionCookie(page)).toBeUndefined();
    expect(await logoutsFor(request, email)).toBe(1);

    await page.goBack();
    await expect(page).toHaveURL(/\/entrar/);
    await expect(
      page.getByRole("navigation", { name: "Navegação do painel" }),
    ).toHaveCount(0);

    const me = await request.get(`${MOCK_API}/v1/me`, {
      headers: { authorization: `Bearer ${oldToken}`, "x-kybr-bff-key": "k" },
    });
    expect(me.status()).toBe(401);
  });
});
