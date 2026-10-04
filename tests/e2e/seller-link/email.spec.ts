import { expect, test, type Page } from "@playwright/test";

import { CASE_TOKENS, SLUGS } from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { createCase, setCaseState } from "../fixtures/mock-api.ts";

// The contact e-mail block (DDR-0001; spec AC 17, 18, 20, 24, 26), on the
// route: the lazy chunk loads, the Server Action round-trips to the mock D5,
// and a reload shows D4's masked address.

const LABEL = "Seu e-mail para avisos";
const EMAIL = "maria@empresa-exemplo.test";

function field(page: Page) {
  return page.getByRole("textbox", { name: LABEL });
}

async function saveEmail(page: Page, email: string): Promise<void> {
  await field(page).fill(email);
  await page.getByRole("button", { name: "Salvar e-mail" }).click();
}

/**
 * The e-mail block and the upload are lazy chunks (next/dynamic): wait until
 * they've loaded and hydrated before pressing their buttons, as a seller's
 * tap before hydration is inert by design.
 */
async function leavesHydrated(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

test.describe("e-mail block @feature-seller-link", () => {
  test("AC 17 / AC 24 (em análise): invalid, then saved with the typed address", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, { ageMs: 60_000 });
    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await leavesHydrated(page);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeFocused();
    await expectNoAxeViolations(page);

    await saveEmail(page, "maria@");
    await expect(
      page.getByText("Confira o e-mail. Exemplo: nome@empresa.com.br"),
    ).toBeVisible();
    await expect(field(page)).toHaveAttribute("aria-invalid", "true");

    await saveEmail(page, EMAIL);
    await expect(
      page.getByRole("status").filter({
        hasText: `E-mail salvo. Vamos avisar em ${EMAIL}.`,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Trocar e-mail" }),
    ).toBeFocused();
    await expectNoAxeViolations(page);
  });

  // On em análise (timeout) the case is still processing, and contract D4
  // carries no resultado then, so the masked address can only come back on a
  // case with one (contract gap raised; quase lá and em análise notfound).
  test("AC 26 (quase lá): a reload shows D4's masked address; Trocar e-mail reopens the field and focuses it", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, {
      kind: "pendente",
      ageMs: 60_000,
    });
    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await leavesHydrated(page);
    await saveEmail(page, EMAIL);
    await expect(
      page.getByText(`E-mail salvo. Vamos avisar em ${EMAIL}.`),
    ).toBeVisible();

    await page.reload();
    await leavesHydrated(page);
    await expect(
      page.getByText(
        "E-mail salvo. Vamos avisar em m•••@empresa-exemplo.test.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();

    await page.getByRole("button", { name: "Trocar e-mail" }).click();
    await expect(field(page)).toBeFocused();
  });

  test("AC 20: the block shows on quase lá; AC 24: offline shows email.error.network and the rest of the page stays usable", async ({
    page,
    context,
    request,
  }) => {
    const token = await createCase(request, {
      kind: "pendente",
      ageMs: 60_000,
    });
    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await leavesHydrated(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Quase lá" }),
    ).toBeVisible();
    await expect(field(page)).toBeVisible();

    await context.setOffline(true);
    await saveEmail(page, EMAIL);
    await expect(
      page.getByText("Não conseguimos salvar o e-mail. Tente de novo."),
    ).toBeVisible();
    await expect(field(page)).toHaveValue(EMAIL);
    await expect(
      page.getByRole("link", { name: "Como regularizar (abre em outra aba)" }),
    ).toBeVisible();

    await context.setOffline(false);
    await page.getByRole("button", { name: "Salvar e-mail" }).click();
    await expect(
      page.getByText(`E-mail salvo. Vamos avisar em ${EMAIL}.`),
    ).toBeVisible();
  });

  test("F06a: a case decided while the page was open refreshes to the result, and the block goes away", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, {
      kind: "pendente",
      ageMs: 60_000,
    });
    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await leavesHydrated(page);
    await expect(field(page)).toBeVisible();

    await setCaseState(request, token, { kind: "aprovado" });
    await saveEmail(page, EMAIL);

    await expect(
      page.getByRole("heading", { level: 1, name: /^Tudo certo, / }),
    ).toBeVisible();
    await expect(field(page)).toHaveCount(0);
  });

  test("AC 18: the block shows on em análise without company data", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.semDados}`);
    await expect(
      page.getByText(/^Ainda não encontramos os dados da sua empresa/),
    ).toBeVisible();
    await expect(field(page)).toBeVisible();
  });

  test("AC 19 / AC 25: never on tudo certo or não aprovado", async ({
    page,
  }) => {
    for (const token of [CASE_TOKENS.aprovado, CASE_TOKENS.bloqueado]) {
      await page.goto(`/v/${SLUGS.ok}/c/${token}`);
      await leavesHydrated(page);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(LABEL)).toHaveCount(0);
    }
  });
});
