import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  createAccount,
  logIn,
  seed,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// S16 (AC 13), the home redirect and the M4 Fila stub, T60.

test.use({ viewport: { width: 1280, height: 800 } });

test.describe("home, Fila stub, not-found, error @feature-ops-panel @panel-access", () => {
  test("/ redirects to /fila: the stub (fila.h1 + fila.lead), the Fila item current", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila", testInfo);
    await createAccount(request, email);
    await logIn(page, email);

    await expect(page).toHaveURL(/\/fila$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Fila de revisão" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Casos que as regras não decidiram sozinhas. Mais antigo primeiro.",
      ),
    ).toBeVisible();
    await expect(page).toHaveTitle("Fila de revisão · Kybr");
    await expect(
      page.locator("aside").getByRole("link", { name: /^Fila de revisão/ }),
    ).toHaveAttribute("aria-current", "page");
    await expectNoAxeViolations(page);
  });

  test("an unknown panel route: notfound.* and Ir para a fila (404), logged out", async ({
    page,
  }) => {
    const response = await page.goto("/nao-existe");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeVisible();
    await expect(
      page.getByText("Este endereço não existe no painel."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ir para a fila" }),
    ).toHaveAttribute("href", "/fila");
    await expectNoAxeViolations(page);
  });

  test("an unknown panel route: the same, logged in; Ir para a fila works", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("perdida", testInfo);
    await createAccount(request, email);
    await logIn(page, email);

    const response = await page.goto("/fila/x/y/z/w");
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "Página não encontrada" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Ir para a fila" }).click();
    await expect(page).toHaveURL(/\/fila$/);
  });

  test("an unexpected error: fatal.* with Tentar de novo and Ir para a fila, no technical detail", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fatal", testInfo);
    await createAccount(request, email);
    await logIn(page, email);
    await seed(request, "me-falha", email);

    await page.goto("/fila");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Algo deu errado nesta tela",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Tente de novo. Se continuar, volte para a fila."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tentar de novo" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ir para a fila" }),
    ).toBeVisible();
    // What's rendered, not the inline RSC payload (where a digest lives by design).
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/digest|AppError|UNAVAILABLE|MSG-BACKEND|Error:/);
    await page.waitForLoadState("networkidle");
    await expectNoAxeViolations(page);
  });
});
