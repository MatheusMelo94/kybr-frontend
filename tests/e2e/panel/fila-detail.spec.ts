import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { seedCases, type MockCase } from "../fixtures/fila-mock.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T100: case detail I — verdict header, checks, no data, O que mudou,
// consultado (AC 29 first half, 30, 31 display half, 32).

function byKind(cases: MockCase[], kind: string): MockCase {
  const found = cases.find((c) => c.kind === kind);
  if (!found) throw new Error(`no ${kind} case`);
  return found;
}

/** The checks' x positions: one column → one distinct x. */
async function columns(page: Page): Promise<number> {
  const xs = await page
    .locator("[data-pane='detail'] article ul > li")
    .evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().x)),
    );
  return new Set(xs).size;
}

test.describe("Fila case detail I (T100) @feature-ops-panel @panel-fila", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the verdict header, six checks in two columns, consultado", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-detalhe", testInfo);
    await createAccount(request, email);
    const cases = await seedCases(request, email, "cada-tipo");
    const link = byKind(cases, "link");
    await logIn(page, email);
    await page.goto(`/fila/${link.id}`);
    const detail = page.locator("[data-pane='detail']");

    await expect(detail.getByText(/^Resultado das regras:/)).toBeAttached();
    await expect(detail.locator(".text-verdict")).toHaveText(
      /^(Aprovar|Revisar|Bloquear)$/,
    );
    // D9: at lg the name is the one visible h2; the page's h1 is fila.h1.
    await expect(
      detail.getByRole("heading", { level: 2, name: link.razao_social ?? "" }),
    ).toBeVisible();
    await expect(detail.getByRole("heading", { level: 1 })).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Fila de revisão" }),
    ).toBeVisible();
    await expect(
      detail.getByText(
        /^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-\d{2}$/,
      ),
    ).toBeVisible();
    await expect(
      detail.getByText(/^\d+ ok, \d+ atenção, \d+ crítico$/),
    ).toBeAttached();

    await expect(detail.locator("article ul > li")).toHaveCount(6);
    expect(await columns(page)).toBe(2);
    await expect(
      detail.getByText(/^Consultado em \d{2}\/\d{2}, \d{2}:\d{2}/),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("a lote case without responsável: the QSA row says qsa_missing", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-qsa", testInfo);
    await createAccount(request, email);
    const cases = await seedCases(request, email, "cada-tipo");
    await logIn(page, email);
    await page.goto(`/fila/${byKind(cases, "lote-sem-qsa").id}`);
    await expect(
      page
        .locator("[data-pane='detail']")
        .getByText(
          "Não informado no lote. Peça o documento do responsável se precisar confirmar.",
        ),
    ).toBeVisible();
  });

  test("an alert case: O que mudou above the checks", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-mudou", testInfo);
    await createAccount(request, email);
    const cases = await seedCases(request, email, "cada-tipo");
    await logIn(page, email);
    await page.goto(`/fila/${byKind(cases, "alerta").id}`);
    const detail = page.locator("[data-pane='detail']");
    const heading = detail.getByRole("heading", { name: "O que mudou" });
    await expect(heading).toBeVisible();
    await expect(detail.getByText(/: antes .+, agora /)).toBeVisible();
    await expect(
      detail.getByText(/^Encontrado na varredura de \d{2}\/\d{2}\/\d{4}\.$/),
    ).toBeVisible();
    const [changeY, checkY] = [
      (await heading.boundingBox())?.y ?? 0,
      (await detail.locator("article ul > li").first().boundingBox())?.y ?? 0,
    ];
    expect(changeY).toBeLessThan(checkY);
  });

  test("DADOS_NAO_ENCONTRADOS: the no-data title and body, no checks", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-semdados", testInfo);
    await createAccount(request, email);
    const cases = await seedCases(request, email, "cada-tipo");
    await logIn(page, email);
    await page.goto(`/fila/${byKind(cases, "nodata").id}`);
    const detail = page.locator("[data-pane='detail']");
    await expect(detail.locator(".text-verdict")).toHaveText(
      "Sem dados da Receita",
    );
    await expect(
      detail.getByText(
        "Ainda não encontramos registro deste CNPJ. Você pode pedir um documento, aprovar ou bloquear.",
      ),
    ).toBeVisible();
    await expect(detail.locator("article ul > li")).toHaveCount(0);
  });
});

test.describe("Fila case detail on phones (T100) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("the name is the h1 below lg; one check column at phone width", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-detalhe-fone", testInfo);
    await createAccount(request, email);
    const cases = await seedCases(request, email, "cada-tipo");
    const link = byKind(cases, "link");
    await logIn(page, email);
    await page.goto(`/fila/${link.id}`);
    const width = page.viewportSize()?.width ?? 0;
    const detail = page.locator("[data-pane='detail']");
    const level = width >= 1024 ? 2 : 1;
    await expect(
      detail.getByRole("heading", { level, name: link.razao_social ?? "" }),
    ).toBeVisible();
    // Two columns from 32 rem of the detail's width (@container/detail).
    expect(await columns(page)).toBe(width >= 600 ? 2 : 1);
    await expectNoAxeViolations(page);
  });
});
