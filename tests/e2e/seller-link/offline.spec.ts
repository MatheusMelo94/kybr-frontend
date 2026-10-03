import { expect, test, type Page } from "@playwright/test";

import {
  CASE_TOKENS,
  SLUGS,
  cnpjFor,
} from "../../fixtures/factories/seller-link.ts";

const MOCK_API = "http://localhost:4010"; // playwright.config.ts
const BANNER = "Sem conexão. Assim que a internet voltar, continuamos daqui.";

/** Resolves when the page sends its next status check (a Server Action POST). */
function nextCheck(page: Page): Promise<unknown> {
  return page.waitForRequest(
    (request) =>
      request.method() === "POST" && !!request.headers()["next-action"],
    { timeout: 3_000 },
  );
}

/** Marks the document; the mark survives only if it's never reloaded. */
async function markDocument(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
}

async function sameDocument(page: Page): Promise<boolean | undefined> {
  return page.evaluate(
    () => (window as unknown as { __sameDocument?: boolean }).__sameDocument,
  );
}

test.describe("offline @feature-seller-link", () => {
  test("AC 29 (verificando): the banner shows, the page never hard-navigates, the 10 s switch still happens, and checks resume online", async ({
    page,
    context,
    request,
  }) => {
    test.setTimeout(40_000);
    const created = await request.post(
      `${MOCK_API}/public/v/${SLUGS.ok}/verify`,
      {
        headers: { "idempotency-key": crypto.randomUUID() },
        data: { cnpj: cnpjFor("lento"), responsavel: "Maria Exemplo" },
      },
    );
    const { token } = (await created.json()) as { token: string };

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Verificando sua empresa" }),
    ).toBeVisible();
    await markDocument(page);

    await context.setOffline(true);
    await expect(
      page.getByRole("status").filter({ hasText: BANNER }),
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(BANNER)).toBeVisible();
    expect(await sameDocument(page)).toBe(true);

    const resumed = nextCheck(page);
    await context.setOffline(false);
    await resumed;
    await expect(page.getByText(BANNER)).toHaveCount(0);
    expect(await sameDocument(page)).toBe(true);
  });

  test("AC 29 (em análise): the banner shows offline; back online it goes and a check runs at once", async ({
    page,
    context,
  }) => {
    await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.processing}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeVisible();
    await markDocument(page);

    await context.setOffline(true);
    await expect(
      page.getByRole("status").filter({ hasText: BANNER }),
    ).toBeVisible();

    const resumed = nextCheck(page);
    await context.setOffline(false);
    await resumed;
    await expect(page.getByText(BANNER)).toHaveCount(0);
    expect(await sameDocument(page)).toBe(true);
  });
});
