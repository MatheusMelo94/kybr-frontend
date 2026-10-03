import { expect, test } from "@playwright/test";

import { CASE_TOKENS, SLUGS } from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  MOCK_API,
  caseReads,
  createCase,
  delayCaseReads,
  uniqueKey,
} from "../fixtures/mock-api.ts";

/** The HTML with the per-request CSP nonce and the token taken out (QA plan Q6). */
function normalized(html: string, token: string): string {
  return html
    .replaceAll(/nonce="[^"]*"/g, 'nonce=""')
    .replaceAll(/nonce\\?":\\?"[^"\\]*/g, "nonce")
    .replaceAll(token, "TOKEN");
}

test.describe("case route boundaries @feature-seller-link", () => {
  test("AC 27: a malformed token is Case not found, with a 404 status and no API call", async ({
    page,
    request,
  }) => {
    const response = await page.goto(`/v/${SLUGS.ok}/c/curto`);

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "Cadastro não encontrado" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Não encontramos este cadastro. Comece de novo pelo link de cadastro.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Começar de novo" }),
    ).toHaveAttribute("href", `/v/${SLUGS.ok}`);
    expect(await caseReads(request, "curto")).toBe(0);
    await expectNoAxeViolations(page);
  });

  test("AC 27: an unknown token is Case not found, never indexed; Começar de novo opens the empty form", async ({
    page,
  }) => {
    const response = await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.unknown}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "Cadastro não encontrado" }),
    ).toBeVisible();
    // loading.tsx streams the skeleton before D4 answers (the T13 soft-404 rule).
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");

    await page.getByRole("link", { name: "Começar de novo" }).click();

    await expect(page).toHaveURL(`/v/${SLUGS.ok}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Cadastro de vendedor" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "CNPJ da empresa" }),
    ).toHaveValue("");
  });

  test("AC 27: a token from another slug answers exactly like an unknown one", async ({
    request,
  }) => {
    // Same slug, so the URLs differ only by the token: S4's real token (it
    // belongs to loja-exemplo) and one that never existed.
    const foreign = await request.get(
      `/v/${SLUGS.other}/c/${CASE_TOKENS.aprovado}`,
    );
    const unknown = await request.get(
      `/v/${SLUGS.other}/c/${CASE_TOKENS.unknown}`,
    );

    expect(foreign.status()).toBe(unknown.status());
    expect(normalized(await foreign.text(), CASE_TOKENS.aprovado)).toBe(
      normalized(await unknown.text(), CASE_TOKENS.unknown),
    );
    expect(await foreign.text()).toContain("Cadastro não encontrado");
  });

  test("AC 28: a case-load failure shows caseerror.*, and Tentar de novo recovers", async ({
    page,
    request,
  }, testInfo) => {
    const token = uniqueKey(CASE_TOKENS.unstable, testInfo);

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Não conseguimos carregar seu cadastro",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Confira sua conexão e tente de novo."),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await request.post(
      `${MOCK_API}/__mock/links/${SLUGS.ok}/cases/${token}/recover`,
    );
    await page.getByRole("button", { name: "Tentar de novo" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Quase lá" }),
    ).toBeVisible();
  });

  test("AC 26: a reload shows the case skeleton, then the current state", async ({
    page,
    request,
  }) => {
    const token = await createCase(request);
    await delayCaseReads(request, token, 1_500);

    await page.goto(`/v/${SLUGS.ok}/c/${token}`, { waitUntil: "commit" });
    await expect(page.getByTestId("case-skeleton")).toBeVisible();
    await expect(page.getByTestId("form-skeleton")).toHaveCount(0);

    await expect(
      page.getByRole("heading", { level: 1, name: "Verificando sua empresa" }),
    ).toBeVisible();
    await expect(page.getByTestId("case-skeleton")).toHaveCount(0);
    await expect(page.getByText("Passo 2 de 3")).toBeAttached();
  });
});
