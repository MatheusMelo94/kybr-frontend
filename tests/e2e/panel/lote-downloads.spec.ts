import { existsSync, readFileSync } from "node:fs";

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { MOCK_API } from "../fixtures/mock-api.ts";
import {
  LINK_URL,
  PANEL_URL,
  createAccount,
  createBatch,
  logIn,
  seed,
  sessionCookie,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T86: the result and errors CSVs, re-escaped on the way out (AC 21
// download; P08 / CR-P8; Security C9; PB8).

const FILENAME = /^kybr-lote-\d{4}-\d{2}-\d{2}-(resultado|erros)\.csv$/;
const BFF = { "x-kybr-bff-key": "e2e-only-bff-key-for-the-local-mock-api" };

/** The backend's own bytes for this batch's file, as the session's user. */
async function backendCsv(
  page: Page,
  id: string,
  file: "result.csv" | "errors.csv",
): Promise<Buffer> {
  const token = await sessionCookie(page);
  const response = await page.request.get(
    `${MOCK_API}/v1/batches/${id}/${file}`,
    { headers: { ...BFF, authorization: `Bearer ${token ?? ""}` } },
  );
  expect(response.status()).toBe(200);
  return response.body();
}

async function download(page: Page, name: string) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name }).click(),
  ]);
  const path = await file.path();
  return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

async function fault(
  request: APIRequestContext,
  email: string,
  endpoint: string,
  kind: string,
): Promise<void> {
  await request.post(`${MOCK_API}/__mock/panel/batch-fault`, {
    data: { email, endpoint, fault: kind, times: 1 },
  });
}

test.describe("Lote: CSV downloads @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Baixar resultado and Baixar erros: the backend's bytes, under the constant name", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-csv", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { finish: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);

    const result = await download(page, "Baixar resultado (CSV)");
    expect(result.name).toMatch(FILENAME);
    expect(result.name).toContain("-resultado.csv");
    expect(result.bytes.equals(await backendCsv(page, id, "result.csv"))).toBe(
      true,
    );

    const errors = await download(page, "Baixar erros (CSV)");
    expect(errors.name).toContain("-erros.csv");
    expect(errors.bytes.equals(await backendCsv(page, id, "errors.csv"))).toBe(
      true,
    );
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("PB8: a backend that didn't escape → the file has the ' prefix; no log carries the file", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-csv-hostil", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "hostil", { finish: true });
    await seed(request, "csv-sem-escape", email);
    await logIn(page, email);
    await page.goto(`/lote/${id}`);

    const raw = (await backendCsv(page, id, "result.csv")).toString("utf8");
    expect(raw).toContain(';"=1+1"');
    const { bytes } = await download(page, "Baixar resultado (CSV)");
    const text = bytes.toString("utf8");
    for (const value of ["=1+1", "+x", "-x", "@x"])
      expect(text).toContain(`;"'${value}"`);
    expect(text).not.toMatch(/;"[=+\-@]/);

    // P16: the server log never carries the file or its CNPJs.
    const log = "e2e-logs/next-server.log";
    if (existsSync(log)) {
      const server = readFileSync(log, "utf8");
      const cnpjs = text
        .split("\r\n")
        .slice(1)
        .filter(Boolean)
        .map((line) => line.split(";")[0]?.replaceAll('"', "") ?? "");
      for (const cnpj of cnpjs) expect(server).not.toContain(cnpj);
      expect(server).not.toContain("Razão social");
    }
  });

  test("no erro rows: only Baixar resultado", async ({ page, request }, testInfo) => {
    const email = uniqueEmail("lote-csv-ok", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "tudo-ok", { finish: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    await expect(
      page.getByRole("button", { name: "Baixar resultado (CSV)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Baixar erros (CSV)" }),
    ).toHaveCount(0);
  });

  test("a file the handler refuses (unterminated quote) → export.error (alert); the button stays usable and a retry downloads", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-csv-falha", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { finish: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);

    await fault(request, email, "result.csv", "csv-aspas");
    const button = page.getByRole("button", { name: "Baixar resultado (CSV)" });
    await button.click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "Não conseguimos gerar o arquivo. Tente de novo.",
    );
    await expect(button).toBeEnabled();
    const { name } = await download(page, "Baixar resultado (CSV)");
    expect(name).toMatch(FILENAME);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("the session ended: the download goes to /entrar?motivo=sessao", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-csv-sessao", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { finish: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    await page.context().clearCookies();
    await page.getByRole("button", { name: "Baixar resultado (CSV)" }).click();
    await page.waitForURL((url) => url.pathname === "/entrar");
    expect(new URL(page.url()).searchParams.get("motivo")).toBe("sessao");
  });

  test("the handlers: headers, GET only, 404 for unknown / malformed / off-host, 307 without a session, 502 on a backend failure", async ({
    page,
    request,
    playwright,
  }, testInfo) => {
    const email = uniqueEmail("lote-csv-rotas", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { finish: true });
    await logIn(page, email);
    const api = page.request;

    const ok = await api.get(`${PANEL_URL}/lote/${id}/resultado.csv`);
    expect(ok.status()).toBe(200);
    const headers = ok.headers();
    expect(headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(headers["content-disposition"]).toMatch(
      /^attachment; filename="kybr-lote-\d{4}-\d{2}-\d{2}-resultado\.csv"$/,
    );
    expect(headers["cache-control"]).toBe("private, no-store");
    expect(headers["x-content-type-options"]).toBe("nosniff");

    expect(
      (await api.post(`${PANEL_URL}/lote/${id}/resultado.csv`)).status(),
    ).toBe(405);
    expect(
      (
        await api.get(
          `${PANEL_URL}/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b/erros.csv`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (await api.get(`${PANEL_URL}/lote/curto/resultado.csv`)).status(),
    ).toBe(404);
    expect(
      (await api.get(`${LINK_URL}/lote/${id}/resultado.csv`)).status(),
    ).toBe(404);

    await fault(request, email, "errors.csv", "500");
    const failed = await api.get(`${PANEL_URL}/lote/${id}/erros.csv`);
    expect(failed.status()).toBe(502);
    expect((await failed.body()).length).toBe(0);

    const anonymous = await playwright.request.newContext();
    const redirected = await anonymous.get(
      `${PANEL_URL}/lote/${id}/resultado.csv`,
      { maxRedirects: 0 },
    );
    expect(redirected.status()).toBe(307);
    // No cookie at all: middleware's gate sends it to /entrar first.
    expect(redirected.headers()["location"]).toMatch(/^\/entrar\?/);
    await anonymous.dispose();

    // A cookie the API no longer knows: the handler's requireSession().
    const stale = await playwright.request.newContext({
      extraHTTPHeaders: { cookie: "kybr_session=sessao-que-nao-existe" },
    });
    const expired = await stale.get(`${PANEL_URL}/lote/${id}/resultado.csv`, {
      maxRedirects: 0,
    });
    expect(expired.status()).toBe(307);
    expect(expired.headers()["location"]).toMatch(/^\/entrar\?motivo=sessao/);
    await stale.dispose();
  });
});
