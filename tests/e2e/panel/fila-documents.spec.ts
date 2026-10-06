import { readFile } from "node:fs/promises";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { caseSeed, casesFor, seedCases } from "../fixtures/fila-mock.ts";
import { MOCK_API } from "../fixtures/mock-api.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";

// T102: the documents handler (D6, Q1, F1–F4). The redirect mode runs on the
// main server (:3000), the F4 attachment mode on its own lit server (:3002,
// QA G9). Rows DR-01–DR-04, DR-08, DR-10–DR-12.

const ATTACHMENT_URL = "http://127.0.0.1:3002";

/** A seeded open case with one uploaded document (PC17). */
async function caseWithDocument(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  await createAccount(request, email);
  const [only] = await seedCases(request, email, "um");
  if (!only) throw new Error("one case");
  const response = await request.post(
    `${MOCK_API}/__mock/panel/cases/${only.id}/upload`,
    { data: { tipo: "CARTAO_CNPJ" } },
  );
  if (response.status() !== 204) throw new Error("upload");
  return only.id;
}

async function docsOrigin(request: APIRequestContext): Promise<string> {
  const body = (await (
    await request.get(`${MOCK_API}/__mock/panel/docs-origin`)
  ).json()) as { origin: string };
  return body.origin;
}

test.describe("Fila documents, redirect mode (T102) @feature-ops-panel @panel-fila", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("DR-01/02: Abrir → 303 to a fresh signed URL on exactly the documents origin, no-store, no-referrer; the popup lands there", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("docs-redirect", testInfo);
    const caseId = await caseWithDocument(request, email);
    const origin = await docsOrigin(request);
    await logIn(page, email);
    await page.goto(`/fila/${caseId}`);
    const open = page
      .locator("[data-pane='detail']")
      .getByRole("link", { name: "Abrir (abre em outra aba)" });
    const href = await open.getAttribute("href");
    if (href === null) throw new Error("href");

    const first = await page.request.get(href, { maxRedirects: 0 });
    const second = await page.request.get(href, { maxRedirects: 0 });
    for (const response of [first, second]) {
      expect(response.status()).toBe(303);
      expect(response.headers()["location"]).toMatch(
        new RegExp(`^${origin}/__docs/[^?]+\\?sig=`),
      );
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    }
    expect(first.headers()["location"]).not.toBe(second.headers()["location"]);

    // The click itself: a popup whose document request reaches the mock's origin.
    const docsResponse = page
      .context()
      .waitForEvent("response", (response) =>
        response.url().startsWith(`${origin}/__docs/`),
      );
    await open.click();
    const landed = await docsResponse;
    expect(landed.status()).toBe(200);
    expect(landed.headers()["referrer-policy"]).toBe("no-referrer");
  });

  for (const [seed, status] of [
    ["doc-host-estranho", 404],
    ["doc-porta", 404],
    // These fail the case's schema first (T93), before the allowlist: on
    // the mock's http: origin the look-alike host is http: off loopback.
    ["doc-host-parecido", 502],
    ["doc-userinfo", 502],
    ["doc-http-externo", 502],
  ] as const) {
    test(`DR-03/04: ${seed} → ${status}, never a Location or a signature`, async ({
      page,
      request,
    }, testInfo) => {
      const email = uniqueEmail(`docs-${seed}`, testInfo);
      const caseId = await caseWithDocument(request, email);
      await logIn(page, email);
      await page.goto(`/fila/${caseId}`);
      const href = await page
        .locator("[data-pane='detail']")
        .getByRole("link", { name: "Abrir (abre em outra aba)" })
        .getAttribute("href");
      await caseSeed(request, email, seed);
      const response = await page.request.get(href ?? "", { maxRedirects: 0 });
      expect(response.status()).toBe(status);
      expect(response.headers()["location"]).toBeUndefined();
      expect(await response.text()).not.toContain("sig=");
    });
  }

  test("a POST to the documents route → 405", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("docs-post", testInfo);
    const caseId = await caseWithDocument(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${caseId}`);
    const href = await page
      .locator("[data-pane='detail']")
      .getByRole("link", { name: "Abrir (abre em outra aba)" })
      .getAttribute("href");
    const response = await page.request.post(href ?? "", { maxRedirects: 0 });
    expect(response.status()).toBe(405);
  });
});

test.describe("Fila documents, attachment mode (T102, F4) @feature-ops-panel @panel-fila", () => {
  test.use({
    baseURL: ATTACHMENT_URL,
    viewport: { width: 1280, height: 800 },
  });

  test("DR-10/11 + F1: Baixar downloads documento-cartao-cnpj.pdf (%PDF-) with the F4 headers; the page holds no document origin or sig", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("docs-anexo", testInfo);
    const caseId = await caseWithDocument(request, email);
    const origin = await docsOrigin(request);
    await logIn(page, email);

    const html = await (await page.request.get(`/fila/${caseId}`)).text();
    expect(html).not.toContain(origin);
    expect(html).not.toContain("sig=");

    const docsRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().startsWith(origin)) docsRequests.push(req.url());
    });
    await page.goto(`/fila/${caseId}`);
    const detail = page.locator("[data-pane='detail']");
    await expect(detail.getByRole("link", { name: /^Abrir/ })).toHaveCount(0);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      detail.getByRole("button", { name: "Baixar" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("documento-cartao-cnpj.pdf");
    expect(
      (await readFile(await download.path())).subarray(0, 5).toString("latin1"),
    ).toBe("%PDF-");
    expect(docsRequests).toEqual([]);

    const [stored] = await casesFor(request, email);
    const href = `/fila/${caseId}/documentos/${stored?.documentos[0] ?? ""}`;
    const response = await page.request.get(href, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="documento-cartao-cnpj.pdf"',
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cross-origin-resource-policy": "same-origin",
      "cache-control": "private, no-store",
    });
  });

  test("DR-12: an HTML body behind a PDF name → export.error next to Baixar, nothing downloaded", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("docs-html", testInfo);
    const caseId = await caseWithDocument(request, email);
    await caseSeed(request, email, "doc-html");
    await logIn(page, email);
    await page.goto(`/fila/${caseId}`);
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });
    const detail = page.locator("[data-pane='detail']");
    await detail.getByRole("button", { name: "Baixar" }).click();
    await expect(detail.getByRole("alert")).toHaveText(
      "Não conseguimos gerar o arquivo. Tente de novo.",
    );
    expect(downloaded).toBe(false);
  });
});
