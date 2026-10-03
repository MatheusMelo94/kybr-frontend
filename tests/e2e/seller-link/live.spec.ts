import { expect, test, type Page } from "@playwright/test";

import { CASE_PRESETS, SLUGS } from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  createCase,
  deleteCase,
  disableLink,
  failCaseReads,
  setCaseState,
  uniqueKey,
} from "../fixtures/mock-api.ts";
import {
  isSameDocument,
  markDocument,
  recordChecks,
} from "../fixtures/live.ts";

// Held cases ("retido", backdated by ageMs) set the server's elapsed time, so
// nothing here waits for S10's real 14 s (QA test plan § Making timing
// deterministic).

const VERIFYING = "Verificando sua empresa";
const ANALYSIS = "Sua empresa está em análise";

function h1(page: Page, name: string): ReturnType<Page["getByRole"]> {
  return page.getByRole("heading", { level: 1, name });
}

/** CaseViewTransition's polite region saying `text` (the offline banner has its own). */
function announcement(page: Page, text: string): ReturnType<Page["getByRole"]> {
  return page.getByRole("status").filter({ hasText: text });
}

test.describe("live status @feature-seller-link", () => {
  test("AC 15 / AC 17: verificando at step 2, then em análise at 10 s from criado_em, in the same document, focused and announced", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, { ageMs: 8_000 });

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(h1(page, VERIFYING)).toBeVisible();
    await markDocument(page);
    await expect(page.getByText("Passo 2 de 3")).toBeAttached();
    // The view's status line (the polite region says it too, T25).
    await expect(
      page.locator("p", {
        hasText: "Consultando Receita Federal, Simples Nacional e SINTEGRA…",
      }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await expect(h1(page, ANALYSIS)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/^A consulta está demorando/)).toBeVisible();
    await expect(page.getByText(/^Este endereço também mostra/)).toBeVisible();
    await expect(page.getByText("Passo 2 de 3")).toBeAttached();
    await expect(h1(page, ANALYSIS)).toBeFocused();
    await expect(announcement(page, ANALYSIS)).toHaveCount(1);
    expect(await isSameDocument(page)).toBe(true);
    await expectNoAxeViolations(page);
  });

  test("AC 17: a reload after 10 s renders em análise directly", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, { ageMs: 11_000 });

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);

    await expect(h1(page, ANALYSIS)).toBeVisible();
    await expect(page.getByText(/^A consulta está demorando/)).toBeVisible();
    await expect(page.getByText(VERIFYING)).toHaveCount(0);
  });

  test("AC 18: no company data shows analysis.body.notfound at once, processing or pending with no items", async ({
    page,
    request,
  }) => {
    const processing = await createCase(request, { kind: "sem-dados" });
    const pendingNoItems = await createCase(
      request,
      CASE_PRESETS.pendingNoItemsNoData,
    );

    for (const token of [processing, pendingNoItems]) {
      await page.goto(`/v/${SLUGS.ok}/c/${token}`);
      await expect(page.getByText("Passo 2 de 3")).toBeAttached();
      await expect(h1(page, ANALYSIS)).toBeVisible();
      await expect(
        page.getByText(
          "Ainda não encontramos os dados da sua empresa. Vamos conferir e avisar o resultado por e-mail.",
        ),
      ).toBeVisible();
    }
    await expectNoAxeViolations(page);
  });

  test("AC 15 / AC 16: checks every 2 s while verifying; the result shows on the next check, focused and announced", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, { responsavel: "Maria Exemplo" });
    const checks = recordChecks(page);

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(h1(page, VERIFYING)).toBeVisible();
    await expect.poll(() => checks.length, { timeout: 8_000 }).toBe(3);
    const gaps = checks
      .slice(1)
      .map((sentAt, index) => sentAt - (checks[index] ?? 0));
    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(1_500);
      expect(gap).toBeLessThan(3_500);
    }

    await setCaseState(request, token, { kind: "aprovado" });

    const result = h1(page, "Tudo certo, Maria.");
    await expect(result).toBeVisible({ timeout: 4_000 });
    await expect(result).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("Tudo certo, Maria.");
    await expect(page.getByText("Passo 3 de 3")).toBeAttached();
  });

  test("AC 17 (arrival): a result that arrives during em análise replaces it on the next 10 s check, announced", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, {
      ageMs: 11_000,
      responsavel: "Maria Exemplo",
    });

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(h1(page, ANALYSIS)).toBeVisible();
    await setCaseState(request, token, { kind: "aprovado" });

    const result = h1(page, "Tudo certo, Maria.");
    await expect(result).toBeVisible({ timeout: 12_000 });
    await expect(result).toBeFocused();
    await expect(page.getByRole("status")).toHaveText("Tudo certo, Maria.");
  });

  test("rule 7: a check the API fails stays silent, and checking carries on", async ({
    page,
    request,
  }) => {
    const token = await createCase(request, { responsavel: "Maria Exemplo" });

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(h1(page, VERIFYING)).toBeVisible();
    await failCaseReads(request, token, 503, 1);
    await setCaseState(request, token, { kind: "aprovado" });

    // The failed check is retried after 5 s; the next one finds the result.
    await expect(h1(page, "Tudo certo, Maria.")).toBeVisible({
      timeout: 9_000,
    });
    await expect(page.getByText(/Sem conexão/)).toHaveCount(0);
  });

  test("AC 17 / rule 7: a case that disappears refreshes to Case not found", async ({
    page,
    request,
  }) => {
    const token = await createCase(request);

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(h1(page, VERIFYING)).toBeVisible();
    await deleteCase(request, token);

    await expect(h1(page, "Cadastro não encontrado")).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("link", { name: "Começar de novo" }),
    ).toHaveAttribute("href", `/v/${SLUGS.ok}`);
  });

  test("Q3: a link disabled while the case is open shows Link not found", async ({
    page,
    request,
  }, testInfo) => {
    const slug = uniqueKey(SLUGS.perTest, testInfo);
    const token = await createCase(request, { slug });

    await page.goto(`/v/${slug}/c/${token}`);
    await expect(h1(page, VERIFYING)).toBeVisible();
    await disableLink(request, slug);

    await expect(h1(page, "Link não encontrado")).toBeVisible({
      timeout: 5_000,
    });
    await expectNoAxeViolations(page);
  });

  test("AC 39: 12.ABC.345/01DE-35 (S16) goes from the form through verificando to tudo certo", async ({
    page,
  }) => {
    await page.goto(`/v/${SLUGS.ok}`);
    await page
      .getByRole("textbox", { name: "CNPJ da empresa" })
      .pressSequentially("12abc34501de35");
    await page
      .getByRole("textbox", { name: "Nome completo do responsável" })
      .fill("Maria Exemplo");
    await expect(page.getByTestId("company-block")).not.toHaveAttribute(
      "aria-busy",
    );
    await page.getByRole("button", { name: "Verificar empresa" }).click();

    await expect(h1(page, VERIFYING)).toBeVisible();
    await expect(h1(page, "Tudo certo, Maria.")).toBeVisible({
      timeout: 10_000,
    });
    await expectNoAxeViolations(page);
  });
});
