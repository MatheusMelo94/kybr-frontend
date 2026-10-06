import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  callsFor,
  createAccount,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T79: the drop zone and the preview, with the real parser worker (spec S7;
// AC 12 Lote half, 14–18; Security C5, C8).

const FILES = join(process.cwd(), "tests/fixtures/files/lote");
const file = (name: string): string => join(FILES, name);

async function pick(page: Page, name: string): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Escolher arquivo" }).click(),
  ]);
  await chooser.setFiles(file(name));
}

/** No batch call was made: nothing sent, nothing spent before the CTA (AC 16). */
async function expectNoBatchCall(
  request: Parameters<typeof callsFor>[0],
  email: string,
) {
  const calls = await callsFor(request, email);
  expect(
    calls.filter(
      (call) => call.path.startsWith("/v1/batches") && call.method === "POST",
    ),
  ).toEqual([]);
}

test.describe("Lote: drop zone and preview @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("AC 16: the AC 16 CSV previews 184 / 4 / 2 with the CTA; no request is made; axe clean", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-previa", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await page.goto("/lote");
    await pick(page, "ac16.csv");

    const preview = page.getByRole("region", {
      name: "Confira antes de verificar",
    });
    await expect(
      preview.getByRole("heading", { name: "Confira antes de verificar" }),
    ).toBeFocused();
    await expect(
      preview.getByText('Encontramos 184 CNPJs na coluna "CNPJ".'),
    ).toBeVisible();
    await expect(
      preview.getByText("4 CNPJs repetidos: verificamos uma vez só."),
    ).toBeVisible();
    await expect(
      preview.getByText("2 CNPJs inválidos: não serão consultados."),
    ).toBeVisible();
    await expect(preview.getByRole("table").locator("tbody tr")).toHaveCount(5);
    await expect(
      preview.getByRole("combobox", { name: "Coluna do CNPJ" }),
    ).toHaveValue("0");
    await expect(
      preview.getByRole("button", { name: "Verificar 184 CNPJs" }),
    ).toBeVisible();
    await expectNoBatchCall(request, email);
    await expectNoAxeViolations(page);

    await preview.getByRole("button", { name: "Trocar arquivo" }).click();
    await expect(
      page.getByRole("button", { name: "Escolher arquivo" }),
    ).toBeFocused();
  });

  for (const name of ["ac16.xlsx", "ac16.xls"])
    test(`${name} reaches the same preview (184 / 4 / 2)`, async ({
      page,
      request,
    }, testInfo) => {
      const email = uniqueEmail("lote-excel", testInfo);
      await createAccount(request, email, "pago");
      await logIn(page, email);
      await page.goto("/lote");
      await pick(page, name);
      const preview = page.getByRole("region", {
        name: "Confira antes de verificar",
      });
      await expect(
        preview.getByText('Encontramos 184 CNPJs na coluna "CNPJ".'),
      ).toBeVisible();
      await expect(
        preview.getByText("4 CNPJs repetidos: verificamos uma vez só."),
      ).toBeVisible();
      await expect(
        preview.getByText("2 CNPJs inválidos: não serão consultados."),
      ).toBeVisible();
    });

  test("AC 15: a PDF, an empty CSV, 5,001 rows and a corrupt XLSX each show their copy in the zone; no request", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-erros", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await page.goto("/lote");
    for (const [name, copy] of [
      ["documento.pdf", "Este arquivo não é CSV nem Excel. Escolha outro."],
      ["vazio.csv", "O arquivo está vazio."],
      [
        "5001-linhas.csv",
        "A lista tem mais de 5.000 linhas. Divida em arquivos menores.",
      ],
      [
        "corrupt.xlsx",
        "Não conseguimos ler o arquivo. Salve de novo como CSV e tente outra vez.",
      ],
    ] as const) {
      await pick(page, name);
      await expect(
        page.locator("main").getByText(copy, { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Escolher arquivo" }),
      ).toHaveAccessibleDescription(copy);
    }
    await expectNoBatchCall(request, email);
  });

  for (const name of ["formatado-ate-12000.xlsx", "dimensao-antiga.xlsx"])
    test(`QA-M5-001: ${name} (a sheet that declares far more rows than it holds) previews its 190 rows`, async ({
      page,
      request,
    }, testInfo) => {
      const email = uniqueEmail("lote-faixa", testInfo);
      await createAccount(request, email, "pago");
      await logIn(page, email);
      await page.goto("/lote");
      await page.waitForLoadState("networkidle");
      await pick(page, name);
      await expect(
        page
          .getByRole("region", { name: "Confira antes de verificar" })
          .getByText('Encontramos 190 CNPJs na coluna "CNPJ".'),
      ).toBeVisible();
      await expect(
        page.getByText("A lista tem mais de 5.000 linhas. Divida em arquivos menores."),
      ).toHaveCount(0);
    });

  test("AC 17: no CNPJ column → nocolumn, the select focused, the CTA unavailable until a column is picked; a column with no valid CNPJ → novalid", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-coluna", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await page.goto("/lote");
    await pick(page, "sem-coluna-cnpj.csv");

    const select = page.getByRole("combobox", { name: "Coluna do CNPJ" });
    await expect(select).toBeFocused();
    await expect(select).toHaveAccessibleDescription(
      "Não achamos a coluna de CNPJ. Escolha qual é.",
    );
    const cta = page.getByRole("button", { name: /^Verificar/ });
    await expect(cta).toHaveAttribute("aria-disabled", "true");
    await select.selectOption({ label: "Nome" });
    await expect(select).toHaveAccessibleDescription(
      "Nenhum CNPJ válido nesta coluna. Escolha outra coluna ou outro arquivo.",
    );
    await expect(cta).toHaveAttribute("aria-disabled", "true");
    await expectNoBatchCall(request, email);
  });

  test("AC 18: 100 checks left and 184 valid → over_allowance, the CTA unavailable", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-saldo", testInfo);
    await createAccount(request, email, "cem");
    await logIn(page, email);
    await page.goto("/lote");
    await pick(page, "ac16.csv");
    const reason =
      "A lista tem 184 CNPJs e você tem 100 verificações disponíveis. Remova linhas ou contrate um plano.";
    await expect(page.getByText(reason)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Verificar 184 CNPJs" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  for (const [preset, text] of [
    [
      "esgotado",
      "As verificações do plano acabaram. Contrate para continuar verificando.",
    ],
    ["semverificacoes", "Esta conta ainda não tem verificações liberadas."],
  ] as const)
    test(`AC 12 (${preset}): the plan banner on /lote, and the preview's CTA explains the plan`, async ({
      page,
      request,
    }, testInfo) => {
      const email = uniqueEmail(`lote-${preset}`, testInfo);
      await createAccount(request, email, preset);
      await logIn(page, email);
      await page.goto("/lote");
      await expect(page.locator("main").getByText(text).first()).toBeVisible();
      await pick(page, "ac16.csv");
      const cta = page.getByRole("button", { name: "Verificar 184 CNPJs" });
      await expect(cta).toHaveAttribute("aria-disabled", "true");
      await expect(cta).toHaveAccessibleDescription(text);
    });

  test("spreadsheet text renders literally (no markup)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-marcacao", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await page.goto("/lote");
    let dialog = false;
    page.on("dialog", (d) => {
      dialog = true;
      void d.dismiss();
    });
    await pick(page, "marcacao.csv");
    await expect(
      page.getByRole("cell", { name: "<img src=x onerror=alert(1)>" }),
    ).toBeVisible();
    await expect(page.locator("main img")).toHaveCount(0);
    expect(dialog).toBe(false);
  });

  test("C5: a client navigation /fila → /lote, then a pick, previews with no CSP violation", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-csp-nav", testInfo);
    await createAccount(request, email, "pago");
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy/i.test(message.text()))
        violations.push(message.text());
    });
    await logIn(page, email);
    await page
      .locator("aside")
      .getByRole("link", { name: "Verificar em lote" })
      .click();
    await page.waitForURL("**/lote");
    await pick(page, "ac16.csv");
    await expect(
      page
        .getByRole("region", { name: "Confira antes de verificar" })
        .getByText('Encontramos 184 CNPJs na coluna "CNPJ".'),
    ).toBeVisible();
    expect(violations).toEqual([]);
  });
});
