import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import {
  caseFault,
  caseSeed,
  seedCases,
  type MockCase,
} from "../fixtures/fila-mock.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T103: the proof PDF (D-C5, AC 42, F12): the comprovante route handler and
// ProofDownload. Rows A42-*.

const NAME = /^kybr-comprovante-\d{4}-\d{2}-\d{2}\.pdf$/;

function byKind(cases: MockCase[], kind: string): MockCase {
  const found = cases.find((c) => c.kind === kind);
  if (!found) throw new Error(`no ${kind} case`);
  return found;
}

test.describe("Fila proof (T103) @feature-ops-panel @panel-fila", () => {
  test("Baixar comprovante downloads the dated PDF (%PDF-); the handler sends the F12 headers @panel-phone", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("prova", testInfo);
    await createAccount(request, email);
    const link = byKind(await seedCases(request, email, "cada-tipo"), "link");
    await logIn(page, email);
    await page.goto(`/fila/${link.id}`);
    const button = page
      .locator("[data-pane='detail']")
      .getByRole("button", { name: "Baixar comprovante" });
    await button.scrollIntoViewIfNeeded();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(NAME);
    expect(
      (await readFile(await download.path())).subarray(0, 5).toString("latin1"),
    ).toBe("%PDF-");

    const response = await page.request.get(`/fila/${link.id}/comprovante`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    const headers = response.headers();
    expect(headers["content-disposition"]).toMatch(
      /^attachment; filename="kybr-comprovante-\d{4}-\d{2}-\d{2}\.pdf"$/,
    );
    expect(headers).toMatchObject({
      "content-type": "application/pdf",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cross-origin-resource-policy": "same-origin",
    });
  });

  test("a backend failure → fila.proof.error next to the button; a retry downloads", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("prova-falha", testInfo);
    await createAccount(request, email);
    const link = byKind(await seedCases(request, email, "cada-tipo"), "link");
    await caseSeed(request, email, "comprovante-falha", { n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${link.id}`);
    const detail = page.locator("[data-pane='detail']");
    const button = detail.getByRole("button", { name: "Baixar comprovante" });
    await button.click();
    await expect(detail.getByRole("alert")).toHaveText(
      "Não conseguimos baixar o comprovante. Tente de novo.",
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(NAME);
  });

  test("an HTML or oversized certificate → 502 with no file; a foreign id → 404; POST → 405", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("prova-recusa", testInfo);
    await createAccount(request, email);
    const link = byKind(await seedCases(request, email, "cada-tipo"), "link");
    await logIn(page, email);
    for (const seed of ["comprovante-html", "comprovante-grande"]) {
      await caseSeed(request, email, seed);
      const response = await page.request.get(`/fila/${link.id}/comprovante`, {
        maxRedirects: 0,
      });
      expect(response.status(), seed).toBe(502);
      expect(response.headers()["content-disposition"], seed).toBeUndefined();
      await caseFault(request, email, "certificate", "none");
    }
    const foreign = await page.request.get(
      "/fila/caso_ffffffffffffffff/comprovante",
      { maxRedirects: 0 },
    );
    expect(foreign.status()).toBe(404);
    const post = await page.request.post(`/fila/${link.id}/comprovante`, {
      maxRedirects: 0,
    });
    expect(post.status()).toBe(405);
  });

  test("no button on a DADOS_NAO_ENCONTRADOS case (D7); one on a decided case", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("prova-d7", testInfo);
    await createAccount(request, email);
    const cases = await seedCases(request, email, "cada-tipo");
    await logIn(page, email);
    await page.goto(`/fila/${byKind(cases, "nodata").id}`);
    const detail = page.locator("[data-pane='detail']");
    await expect(detail.locator("[data-detail-heading]:visible")).toBeVisible();
    await expect(
      detail.getByRole("button", { name: "Baixar comprovante" }),
    ).toHaveCount(0);
    await page.goto(`/fila/${byKind(cases, "decidido-aprovar").id}`);
    await expect(
      detail.getByRole("button", { name: "Baixar comprovante" }),
    ).toBeVisible();
  });
});
