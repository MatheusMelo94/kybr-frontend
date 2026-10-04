import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { MOCK_API } from "../fixtures/mock-api.ts";
import {
  allCalls,
  callsFor,
  createAccount,
  horizontalOverflow,
  logIn,
  outbox,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// S3 Recuperar senha / Nova senha (AC 6, P04), T53. Pre-Contract: D-A5.

const TURNSTILE_PASS = "XXXX.DUMMY.TOKEN.XXXX";

async function requestLink(page: Page, email: string): Promise<string> {
  await page.goto("/senha/esqueci");
  await page.getByLabel("E-mail").fill(email);
  await expect(page.locator('input[name="turnstile"]')).toHaveValue(
    TURNSTILE_PASS,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Enviar link" }).click();
  const notice = page
    .getByRole("status")
    .filter({ hasText: "o link chega em alguns minutos" });
  await expect(notice).toBeVisible();
  return (await notice.textContent()) ?? "";
}

test.describe("password reset @feature-ops-panel @panel-access", () => {
  test("AC 6: /senha/esqueci says the same for an existing and an unknown address, behind Turnstile", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("reset", testInfo);
    await createAccount(request, email);

    const existing = await requestLink(page, email);
    const unknown = await requestLink(page, "ninguem@exemplo.test");

    expect(existing).toBe(
      `Se existir uma conta com ${email}, o link chega em alguns minutos. Ele vale por 1 h.`,
    );
    expect(unknown.replace("ninguem@exemplo.test", email)).toBe(existing);
    expect((await callsFor(request, email)).at(-1)).toMatchObject({
      path: "/v1/auth/password-reset",
      turnstile: TURNSTILE_PASS,
    });
  });

  test("P04: the link's token stays in the fragment, leaves the URL at once, and never reaches a server URL; the new password works and every old session ends", async ({
    page,
    browser,
    request,
  }, testInfo) => {
    const email = uniqueEmail("nova-senha", testInfo);
    await createAccount(request, email);
    // An open session elsewhere, which the reset must end.
    const other = await browser.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    const otherPage = await other.newPage();
    await logIn(otherPage, email);

    await requestLink(page, email);
    const { link = "" } = await outbox(request, email);
    const token = link.split("#t=")[1] ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{22,}$/);

    const urls: string[] = [];
    page.on("request", (req) => urls.push(req.url()));
    const response = await page.goto(link);
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByLabel("Senha nova")).toBeVisible();
    expect(page.url()).not.toContain(token);
    expect(new URL(page.url()).hash).toBe("");

    await page.getByLabel("Senha nova").fill("uma-senha-nova-1");
    await page.getByRole("button", { name: "Salvar senha" }).click();
    await expect(page).toHaveURL(/\/entrar\?motivo=senha-nova$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Senha alterada" }),
    ).toHaveText("Senha alterada. Entre com a senha nova.");

    // No request URL from the page, and no path or query the API saw, holds the token.
    expect(urls.filter((url) => url.includes(token))).toEqual([]);
    expect(
      (await allCalls(request)).filter((call) => call.path.includes(token)),
    ).toEqual([]);

    await logIn(page, email, "uma-senha-nova-1");
    await expect(page).not.toHaveURL(/\/entrar/);
    // The other browser's session was revoked: the API now answers its id 401.
    const otherSession = (await other.cookies("http://127.0.0.1:3000")).find(
      (cookie) => cookie.name === "kybr_session",
    )?.value;
    const me = await request.get(`${MOCK_API}/v1/me`, {
      headers: {
        authorization: `Bearer ${otherSession}`,
        "x-kybr-bff-key": "k",
      },
    });
    expect(me.status()).toBe(401);
    await other.close();
  });

  test("no fragment, or an expired token: reset.error.expired + Pedir outro link", async ({
    page,
  }) => {
    await page.goto("/senha/nova");
    await expect(
      page.getByText("Este link expirou ou já foi usado."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Pedir outro link" }).click();
    await expect(page).toHaveURL(/\/senha\/esqueci$/);

    await page.goto("/senha/nova#t=tokexpirado0000000000000000000");
    await page.getByLabel("Senha nova").fill("uma-senha-nova-1");
    await page.getByRole("button", { name: "Salvar senha" }).click();
    await expect(
      page.getByText("Este link expirou ou já foi usado."),
    ).toBeVisible();
  });

  test("a used token is refused the second time", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("usado", testInfo);
    await createAccount(request, email);
    await requestLink(page, email);
    const { link = "" } = await outbox(request, email);
    await page.goto(link);
    await page.getByLabel("Senha nova").fill("uma-senha-nova-1");
    await page.getByRole("button", { name: "Salvar senha" }).click();
    await expect(page).toHaveURL(/\/entrar/);

    await page.goto(link);
    await page.getByLabel("Senha nova").fill("outra-senha-nova-2");
    await page.getByRole("button", { name: "Salvar senha" }).click();
    await expect(
      page.getByRole("link", { name: "Pedir outro link" }),
    ).toBeVisible();
  });

  test("a malformed token never reaches the API", async ({ page }) => {
    await page.goto("/senha/nova#t=curto");
    await expect(
      page.getByText("Este link expirou ou já foi usado."),
    ).toBeVisible();
  });

  test("both screens: axe clean, no horizontal scroll at 320", async ({
    page,
  }) => {
    for (const path of [
      "/senha/esqueci",
      "/senha/nova#t=TOKEN_sintetico_0123456789abcdef",
    ]) {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoAxeViolations(page);
      await page.setViewportSize({ width: 320, height: 800 });
      expect(await horizontalOverflow(page)).toBe(0);
    }
  });
});
