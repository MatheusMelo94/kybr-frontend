import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  caseFault,
  caseSeed,
  seedCases,
  type MockCase,
} from "../fixtures/fila-mock.ts";
import { MOCK_API } from "../fixtures/mock-api.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T100: case detail I — verdict header, checks, no data, O que mudou,
// consultado (AC 29 first half, 30, 31 display half, 32). T101: case detail
// II — seller, documents, history, partial, decided, detail error, F1, F11
// (AC 28 detail half, AC 29 second half, AC 41 decided half).

/** PC17: the seller sends a document, so the open case has one. */
async function upload(
  request: Parameters<typeof seedCases>[0],
  caseId: string,
): Promise<void> {
  const response = await request.post(
    `${MOCK_API}/__mock/panel/cases/${caseId}/upload`,
    { data: { tipo: "CARTAO_CNPJ" } },
  );
  if (response.status() !== 204) throw new Error("upload");
}

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

test.describe("Fila case detail II (T101) @feature-ops-panel @panel-fila", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("seller, documents (Abrir in a new tab) and history; F1: no document origin or sig in the HTML or a soft navigation's RSC", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-docs", testInfo);
    await createAccount(request, email);
    const [first, second] = await seedCases(request, email, "dois");
    if (!first || !second) throw new Error("two cases");
    await upload(request, second.id);
    const origin = (
      (await (
        await request.get(`${MOCK_API}/__mock/panel/docs-origin`)
      ).json()) as { origin: string }
    ).origin;
    await logIn(page, email);

    const html = await (await page.request.get(`/fila/${second.id}`)).text();
    expect(html).not.toContain(origin);
    expect(html).not.toContain("sig=");

    await page.goto(`/fila/${first.id}`);
    await expect(page.locator("[data-detail-heading]:visible")).toBeVisible();
    const payloads: Promise<string>[] = [];
    page.on("response", (response) => {
      if (response.url().includes("_rsc"))
        payloads.push(response.text().catch(() => ""));
    });
    const option = page
      .getByRole("option")
      .filter({ hasText: second.razao_social ?? "" });
    await option.click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second.id}$`));
    const detail = page.locator("[data-pane='detail']");
    await expect(
      detail.getByRole("heading", { name: "Documentos" }),
    ).toBeVisible();
    const open = detail.getByRole("link", {
      name: "Abrir (abre em outra aba)",
    });
    await expect(open).toHaveAttribute(
      "href",
      new RegExp(`^/fila/${second.id}/documentos/[^/]+$`),
    );
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", "noopener noreferrer");
    await expect(
      detail.getByRole("heading", { name: "Histórico" }),
    ).toBeVisible();
    await expect(
      detail.getByText("Documento recebido: Cartão CNPJ atualizado"),
    ).toBeVisible();
    await expect(
      detail.getByRole("heading", { name: "Vendedor" }),
    ).toBeVisible();
    expect(payloads.length).toBeGreaterThan(0);
    for (const body of await Promise.all(payloads)) {
      expect(body).not.toContain(origin);
      expect(body).not.toContain("sig=");
    }
    await expectNoAxeViolations(page);
  });

  test("eventos-falha: the history left out, fila.detail.partial shown", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-parcial", testInfo);
    await createAccount(request, email);
    const [first] = await seedCases(request, email, "um");
    await caseSeed(request, email, "eventos-falha");
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    const detail = page.locator("[data-pane='detail']");
    await expect(
      detail.getByText(
        "Parte do histórico não carregou. As decisões funcionam normalmente.",
      ),
    ).toBeVisible();
    await expect(
      detail.getByRole("heading", { name: "Histórico" }),
    ).toHaveCount(0);
  });

  test("detalhe-falha: the list stays, the detail shows the error; the retry recovers", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-detalhe-falha", testInfo);
    await createAccount(request, email);
    const [first] = await seedCases(request, email, "dois");
    await caseSeed(request, email, "detalhe-falha");
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    const alert = page.locator("[data-pane='detail']").getByRole("alert");
    await expect(alert).toContainText("Não conseguimos abrir este caso.");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
    await caseFault(request, email, "case", "none");
    await alert.getByRole("button", { name: "Tentar de novo" }).click();
    await expect(page.locator("[data-detail-heading]:visible")).toBeVisible();
    await expect(alert).toHaveCount(0);
  });

  test("a decided case: the banner with reason and note, Voltar para a fila, no other action", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-decidido", testInfo);
    await createAccount(request, email);
    const cases = await seedCases(request, email, "cada-tipo");
    await logIn(page, email);
    await page.goto(`/fila/${byKind(cases, "decidido-bloquear").id}`);
    const detail = page.locator("[data-pane='detail']");
    await expect(
      detail.getByText(/^Decidido: Bloqueado em \d{2}\/\d{2}, \d{2}:\d{2}\.$/),
    ).toBeVisible();
    await expect(detail.getByText(/^Motivo: /)).toBeVisible();
    await expect(
      detail.getByRole("link", { name: "Voltar para a fila" }),
    ).toBeVisible();
    await expect(detail.getByRole("button")).toHaveCount(0);
  });

  test("F11: an extra vendedor_email on the wire never reaches the page", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-f11", testInfo);
    await createAccount(request, email);
    const [hostil] = await seedCases(request, email, "hostil");
    await logIn(page, email);
    await page.goto(`/fila/${hostil?.id}`);
    await expect(page.locator("[data-detail-heading]:visible")).toBeVisible();
    expect(await page.content()).not.toContain("vendedor@exemplo.test");
    expect(
      await page.locator("[data-pane='detail']").innerText(),
    ).not.toContain("@");
  });
});

test.describe("Fila case detail II on phones (T101) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("Voltar para a fila at the top of a case below lg", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-voltar", testInfo);
    await createAccount(request, email);
    const [first] = await seedCases(request, email, "dois");
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}?aba=aberto&ate=50`);
    const back = page.getByRole("link", { name: "Voltar para a fila" });
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(back).toBeHidden();
      return;
    }
    await back.click();
    await expect(page).toHaveURL(/\/fila\?ate=50$/);
    await expect(page.getByRole("listbox")).toBeVisible();
  });
});
