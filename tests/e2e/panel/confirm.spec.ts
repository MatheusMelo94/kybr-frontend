import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  PANEL_URL,
  createAccount,
  horizontalOverflow,
  outbox,
  pendingSignup,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// S2 Confirmar (AC 3), T52. Pre-Contract: D-A2, D-A3 on the mock.

const formAlert = (page: Page) => page.getByRole("main").getByRole("alert");

async function confirm(page: Page, code: string): Promise<void> {
  await page.getByLabel("Código").fill(code);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    ),
    page.getByRole("button", { name: "Confirmar" }).click(),
  ]);
  // The response lands before the form handles it: until the button reads
  // "Confirmar" again the submit guard is still set and drops the next press.
  await expect(
    page.getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeVisible();
}

test.describe("/cadastro/confirmar @feature-ops-panel @panel-access @panel-phone", () => {
  test("AC 3: the typed e-mail and the code's 10 minutes, one numeric one-time-code field; axe clean; no horizontal scroll at 320", async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail("confirmar", testInfo);
    await pendingSignup(page, email);
    await page.goto("/cadastro/confirmar");

    await expect(
      page.getByText(
        `Enviamos um código de 6 dígitos para ${email}. Ele vale por 10 minutos.`,
      ),
    ).toBeVisible();
    const field = page.getByLabel("Código");
    await expect(field).toHaveAttribute("autocomplete", "one-time-code");
    await expect(field).toHaveAttribute("inputmode", "numeric");
    await expect(
      page.getByRole("button", { name: /Reenviar em \d+ s/ }),
    ).toBeDisabled();
    expect(page.url()).not.toContain("exemplo.test");
    await expectNoAxeViolations(page);

    await page.setViewportSize({ width: 320, height: 800 });
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("a wrong code, then an expired one, then the right one pasted with spaces → session, /comecar", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("codigo", testInfo);
    await pendingSignup(page, email);
    await page.goto("/cadastro/confirmar");

    await confirm(page, "000000");
    await expect(formAlert(page)).toHaveText(
      "Código incorreto. Confira o e-mail e tente de novo.",
    );
    await expect(page.getByLabel("Código")).toBeFocused();

    await confirm(page, "111111");
    await expect(formAlert(page)).toHaveText(
      'Este código não vale mais. Use "Reenviar código" para receber um novo.',
    );

    const { codigo = "" } = await outbox(request, email);
    await page
      .getByLabel("Código")
      .fill(`${codigo.slice(0, 3)} ${codigo.slice(3)}`);
    await expect(page.getByLabel("Código")).toHaveValue(codigo);
    await page.getByRole("button", { name: "Confirmar" }).click();

    await expect(page).toHaveURL(/\/comecar$/);
    const cookies = await page.context().cookies(PANEL_URL);
    expect(
      cookies.find((cookie) => cookie.name === "kybr_session")?.value,
    ).toBeTruthy();
    expect(
      cookies.find((cookie) => cookie.name === "kybr_signup"),
    ).toBeUndefined();
  });

  test("from the 6th attempt the code is dead: confirm.error.expired, not a rate limit (Q3)", async ({
    page,
  }, testInfo) => {
    await pendingSignup(page, uniqueEmail("seis", testInfo));
    await page.goto("/cadastro/confirmar");
    for (let attempt = 0; attempt < 5; attempt++) await confirm(page, "000000");
    await confirm(page, "000000");

    await expect(formAlert(page)).toHaveText(
      'Este código não vale mais. Use "Reenviar código" para receber um novo.',
    );
  });

  test("resend: with the check passed it sends, announces confirm.resent politely, and the countdown restarts", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("reenvio", testInfo);
    await pendingSignup(page, email, 0);
    await page.goto("/cadastro/confirmar");
    const before = (await outbox(request, email)).codigo;
    await expect(page.locator('input[name="turnstile"]')).toHaveValue(
      "XXXX.DUMMY.TOKEN.XXXX",
      { timeout: 20_000 },
    );

    await page.getByRole("button", { name: "Reenviar código" }).click();

    await expect(
      page.getByRole("status").filter({ hasText: "Código reenviado" }),
    ).toHaveText(`Código reenviado para ${email}.`);
    await expect(
      page.getByRole("button", { name: /Reenviar em (60|59|58) s/ }),
    ).toBeDisabled();
    expect((await outbox(request, email)).codigo).toMatch(/^\d{6}$/);
    expect(before).toMatch(/^\d{6}$/);
  });

  test('"E-mail errado? Voltar" returns to /cadastro with the values kept, the password empty', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail("voltar", testInfo);
    await pendingSignup(page, email);
    await page.goto("/cadastro/confirmar");
    await page.getByRole("link", { name: "E-mail errado? Voltar" }).click();

    await expect(page).toHaveURL(/\/cadastro$/);
    await expect(page.getByLabel("Seu nome")).toHaveValue("Pessoa Exemplo");
    await expect(page.getByLabel("Nome da plataforma")).toHaveValue(
      "Plataforma Exemplo",
    );
    await expect(page.getByLabel("E-mail de trabalho")).toHaveValue(email);
    await expect(page.getByLabel("Senha")).toHaveValue("");
  });

  test("without a pending sign-up the page sends back to /cadastro", async ({
    page,
  }) => {
    await page.goto("/cadastro/confirmar");
    await expect(page).toHaveURL(/\/cadastro$/);
  });

  test("arriving from login (unconfirmed): login.notice.unconfirmed as a status above the body, countdown running (Q5)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("pendente", testInfo);
    await createAccount(request, email, "pendente");
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("senha-correta-123");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/cadastro\/confirmar\?origem=login$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Falta confirmar" }),
    ).toHaveText("Falta confirmar seu e-mail para entrar.");
    await expect(
      page.getByText(`Enviamos um código de 6 dígitos para ${email}.`, {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Reenviar em \d+ s/ }),
    ).toBeDisabled();
    // The API sent a code with the login attempt; it confirms the account.
    const { codigo = "" } = await outbox(request, email);
    await confirm(page, codigo);
    await expect(page).toHaveURL(/\/comecar$/);
  });
});
