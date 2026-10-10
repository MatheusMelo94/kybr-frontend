import { expect, test, type Locator, type Page } from "@playwright/test";

import { createAccount, outbox, uniqueEmail } from "../fixtures/panel-mock.ts";

// T63: the M4 access journey, keyboard only (QA § Acceptance Criteria → Test
// Cases; spec J1, J2; AC 1–8, 13). Runs at 1280 (panel-desktop) and on the
// phone projects (360/768).

const TURNSTILE_PASS = "XXXX.DUMMY.TOKEN.XXXX";

/** Presses Tab until `target` has focus (never clicks, never calls focus()). */
async function tabTo(page: Page, target: Locator, max = 40): Promise<void> {
  for (let presses = 0; presses < max; presses++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("tabTo: the target was never reached by Tab");
}

async function typeInto(
  page: Page,
  field: Locator,
  text: string,
): Promise<void> {
  await tabTo(page, field);
  await page.keyboard.type(text);
}

async function pressOn(
  page: Page,
  target: Locator,
  key = "Enter",
): Promise<void> {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

test.describe("M4 access journey, keyboard only @feature-ops-panel @panel-access @panel-phone", () => {
  test.setTimeout(120_000);

  test("sign up → code → onboarding → Fila; Sair; log in with volta; reset the password → log in", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("jornada", testInfo);

    // S1: /cadastro
    await page.goto("/cadastro");
    await typeInto(page, page.getByLabel("Seu nome"), "Pessoa Exemplo");
    await typeInto(
      page,
      page.getByLabel("Nome da plataforma"),
      "Plataforma Exemplo",
    );
    await typeInto(page, page.getByLabel("E-mail de trabalho"), email);
    await typeInto(page, page.getByLabel("Senha"), "uma-senha-segura-1");
    await pressOn(page, page.getByRole("checkbox"), "Space");
    await expect(page.getByRole("checkbox")).toBeChecked();
    await expect(page.locator('input[name="turnstile"]')).toHaveValue(
      TURNSTILE_PASS,
      { timeout: 20_000 },
    );
    await pressOn(page, page.getByRole("button", { name: "Criar conta" }));

    // S2: the code from the outbox
    await expect(page).toHaveURL(/\/cadastro\/confirmar$/);
    const { codigo = "" } = await outbox(request, email);
    await typeInto(page, page.getByLabel("Código"), codigo);
    await page.keyboard.press("Enter");

    // S4: onboarding step 1
    await expect(page).toHaveURL(/\/comecar$/);
    await expect(page.getByText("Passo 1 de 2")).toBeVisible();
    await typeInto(
      page,
      page.getByLabel("E-mail para vendedores"),
      "suporte@exemplo.test",
    );
    // Arrow keys move inside a radio group: Tab lands on it, Space picks.
    await pressOn(
      page,
      page.getByRole("radio", { name: "Lojas de peças" }),
      "Space",
    );
    await pressOn(page, page.getByRole("button", { name: "Continuar" }));

    // Step 2 (M5): Lote with the onboarding banner, inside the shell
    await expect(page).toHaveURL(/\/lote\?inicio=1$/);
    await expect(page.getByText("Passo 2 de 2")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Verificar em lote" }),
    ).toBeVisible();

    // Sair through the "Conta" menu button
    await pressOn(
      page,
      page.getByRole("button", { name: "Conta" }).locator("visible=true"),
    );
    await expect(page.getByRole("menuitem", { name: "Sair" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/entrar\?motivo=saiu$/);
    await expect(
      page.getByRole("status").filter({ hasText: "Você saiu do painel." }),
    ).toBeFocused();

    // A protected link → login → back to it (volta)
    await page.goto("/fila?aba=x");
    await expect(page).toHaveURL(/\/entrar\?volta=%2Ffila%3Faba%3Dx$/);
    await typeInto(page, page.getByLabel("E-mail"), email);
    await typeInto(page, page.getByLabel("Senha"), "uma-senha-segura-1");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fila\?aba=x$/);

    // Reset the password, then log in with the new one
    await page.context().clearCookies();
    await page.goto("/entrar");
    await pressOn(
      page,
      page.getByRole("link", { name: "Esqueci minha senha" }),
    );
    await expect(page).toHaveURL(/\/senha\/esqueci$/);
    await typeInto(page, page.getByLabel("E-mail"), email);
    await expect(page.locator('input[name="turnstile"]')).toHaveValue(
      TURNSTILE_PASS,
      { timeout: 20_000 },
    );
    await pressOn(page, page.getByRole("button", { name: "Enviar link" }));
    await expect(
      page.getByRole("status").filter({ hasText: "o link chega" }),
    ).toBeVisible();
    const { link = "" } = await outbox(request, email);
    await page.goto(link);
    await typeInto(page, page.getByLabel("Senha nova"), "outra-senha-segura-2");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/entrar\?motivo=senha-nova$/);
    await typeInto(page, page.getByLabel("E-mail"), email);
    await typeInto(page, page.getByLabel("Senha"), "outra-senha-segura-2");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/$/);
  });

  test("an onboarded account logs in from the keyboard and lands on Início", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("teclado", testInfo);
    await createAccount(request, email);
    await page.goto("/entrar");
    await typeInto(page, page.getByLabel("E-mail"), email);
    await typeInto(page, page.getByLabel("Senha"), "senha-correta-123");
    await pressOn(page, page.getByRole("button", { name: "Entrar" }));
    await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:3000\/$/);
  });
});
