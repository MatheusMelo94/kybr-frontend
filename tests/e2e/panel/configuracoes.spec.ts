import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { holdNextAction } from "../fixtures/fila-timing.ts";
import { seedDashboard, settingsFault } from "../fixtures/home-mock.ts";
import {
  callsFor,
  expireSessions,
  LINK_URL,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T135: Configurações (S12; AC 60 save/link half, AC 7, O-F8): the account
// menu opens it, a save reaches /v/{slug} at once (revalidateTag), a failure
// keeps the values, a javascript: contact is refused at save, and a dirty
// form survives a session expiry as perdido=1.

const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Salvar alterações" });
const platformName = (page: Page) =>
  page.getByRole("textbox", { name: "Nome da plataforma" });

async function openSettings(
  page: Page,
  request: Parameters<typeof seedDashboard>[0],
  email: string,
): Promise<string> {
  await seedDashboard(request, email, "populado");
  await logIn(page, email);
  await page.goto("/configuracoes");
  await expect(page).toHaveTitle("Configurações · Kybr");
  const link = await page
    .getByRole("textbox", { name: "Link de cadastro" })
    .inputValue();
  const slug = new URL(link).pathname.split("/").at(-1) ?? "";
  expect(slug).not.toBe("");
  return slug;
}

test.describe("Configurações @feature-ops-panel @panel-operacao", () => {
  test("the account menu's Configurações opens it; Primeiros passos' link lands on #link", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("config-menu", testInfo);
    await seedDashboard(request, email, "populado");
    await logIn(page, email);
    await page.getByRole("button", { name: "Conta" }).first().click();
    await page.getByRole("menuitem", { name: "Configurações" }).click();
    await expect(page).toHaveURL(/\/configuracoes$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Configurações" }),
    ).toBeVisible();
    await expect(page.getByRole("menu")).toHaveCount(0);

    await page.goto("/configuracoes#link");
    await expect(
      page.locator("#link").getByRole("heading", { name: "Link de cadastro" }),
    ).toBeInViewport();
  });

  test("AC 60: a save toasts, is busy meanwhile, and /v/{slug} shows the new name and contact at once @panel-phone", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("config-salvar", testInfo);
    const slug = await openSettings(page, request, email);
    await expect(saveButton(page)).toBeDisabled();

    const nome = `Plataforma ${testInfo.workerIndex}-${Date.now()}`;
    await platformName(page).fill(nome);
    await page.getByRole("radio", { name: "Página de ajuda" }).check();
    await page
      .getByRole("textbox", { name: "Endereço da página de ajuda" })
      .fill("https://ajuda.exemplo.test/vendedores");
    await expect(saveButton(page)).toBeEnabled();

    const release = await holdNextAction(page, "nome_plataforma");
    await saveButton(page).click();
    await expect(saveButton(page)).toHaveAttribute("aria-busy", "true");
    release();
    await expect(
      page.getByRole("status").filter({ hasText: "Alterações salvas" }),
    ).toBeVisible();
    await expect(saveButton(page)).toBeDisabled();

    const link = await page.context().newPage();
    await link.goto(`${LINK_URL}/v/${slug}`);
    await expect(link.getByText(nome).first()).toBeVisible();
    await link.goto(`${LINK_URL}/v/${slug}/privacidade`);
    expect(await link.content()).toContain(
      "https://ajuda.exemplo.test/vendedores",
    );
    await link.close();
  });

  test("a failed save: error.network inline, the values kept", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("config-falha", testInfo);
    await openSettings(page, request, email);
    await settingsFault(request, email, "workspace-put", { kind: "503" });
    await platformName(page).fill("Plataforma Mantida");
    await saveButton(page).click();
    await expect(
      page
        .getByRole("form", { name: "Configurações" })
        .getByRole("alert")
        .filter({ hasText: /\S/ }),
    ).toHaveText(
      "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
    );
    await expect(platformName(page)).toHaveValue("Plataforma Mantida");
    await expect(saveButton(page)).toBeEnabled();
  });

  test("O-F8: a javascript: contact is refused at save, on the field, with focus; nothing is sent", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("config-js", testInfo);
    await openSettings(page, request, email);
    await page.getByRole("radio", { name: "Página de ajuda" }).check();
    const contact = page.getByRole("textbox", {
      name: "Endereço da página de ajuda",
    });
    await contact.fill("javascript:alert(1)");
    const before = (await callsFor(request, email)).length;
    await saveButton(page).click();
    await expect(contact).toBeFocused();
    await expect(contact).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Informe um endereço que comece com https://."),
    ).toBeVisible();
    const puts = (await callsFor(request, email))
      .slice(before)
      .filter((call) => call.method === "PUT");
    expect(puts).toEqual([]);
  });

  test("AC 7: a dirty form and an expired session: /entrar with perdido=1", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("config-perdido", testInfo);
    await openSettings(page, request, email);
    await platformName(page).fill("Rascunho");
    await expireSessions(request, email);
    await saveButton(page).click();
    await expect(page).toHaveURL(/\/entrar\?.*perdido=1/);
    expect(page.url()).not.toContain("Rascunho");
  });

  test("ADR-0008 Addendum 2: saveSettingsAction is owned by /configuracoes' page", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as {
      node: Record<
        string,
        { exportedName?: string; workers: Record<string, unknown> }
      >;
    };
    const entry = Object.values(manifest.node).find(
      (value) => value.exportedName === "saveSettingsAction",
    );
    expect(Object.keys(entry?.workers ?? {})).toContain(
      "app/(panel)/painel/(app)/configuracoes/page",
    );
  });
});
