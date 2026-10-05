import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { actionId } from "../fixtures/actions.ts";
import {
  LINK_URL,
  PANEL_URL,
  batchesFor,
  callsFor,
  createAccount,
  expireSessions,
  logIn,
  seed,
  setPlan,
  uniqueEmail,
  unseed,
} from "../fixtures/panel-mock.ts";
import { cnpjWithRoot } from "../../fixtures/factories/panel.ts";

// T80: startBatchAction and the CTA (AC 16 "no credit before the CTA", AC 18
// server side, AC 19 start; ADR-0012 item 8; Security C1, C2; ADR-0008
// Addendum 2).

const FILES = join(process.cwd(), "tests/fixtures/files/lote");
const MiB = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function preview(page: Page, name = "ac16.csv"): Promise<void> {
  await page.goto("/lote");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Escolher arquivo" }).click(),
  ]);
  await chooser.setFiles(join(FILES, name));
  await expect(page.getByRole("heading", { name: "Confira antes de verificar" })).toBeVisible();
}

const cta = (page: Page) => page.getByRole("button", { name: /^(Verificar \d|Começando)/ });

async function starts(request: Parameters<typeof callsFor>[0], email: string) {
  return (await callsFor(request, email)).filter(
    (call) => call.method === "POST" && call.path === "/v1/batches",
  );
}

test.describe("Lote: starting a batch @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Verificar 184 CNPJs starts one batch with a uuid key and opens it; the nav says Verificando at once", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-inicio", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await preview(page);
    expect(await starts(request, email)).toEqual([]);

    await cta(page).click();
    await page.waitForURL(/\/lote\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "Verificando 184 CNPJs" })).toBeVisible();
    await expect(
      page.locator("aside").getByRole("link", { name: "Verificar em lote Verificando" }),
    ).toBeVisible();
    const [start] = await starts(request, email);
    expect(start?.rows).toBe(184);
    expect(start?.idempotencyKey).toMatch(UUID);
  });

  test("a double click starts one batch (PB5)", async ({ page, request }, testInfo) => {
    const email = uniqueEmail("lote-duplo", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await preview(page);
    await cta(page).dblclick();
    await page.waitForURL(/\/lote\/[0-9a-f-]{36}$/);
    expect(await batchesFor(request, email)).toHaveLength(1);
  });

  test("a dropped connection → error.network with the preview kept; the retry reuses the key", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-queda", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await preview(page);
    await seed(request, "queda-de-rede-lote", email);
    await cta(page).click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
    );
    await expect(page.getByRole("heading", { name: "Confira antes de verificar" })).toBeVisible();

    await unseed(request, "queda-de-rede-lote", email);
    await cta(page).click();
    await page.waitForURL(/\/lote\/[0-9a-f-]{36}$/);
    const keys = (await starts(request, email)).map((call) => call.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(await batchesFor(request, email)).toHaveLength(1);
  });

  test("402 → the over-allowance state with the server's disponiveis (AC 18)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-402", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await preview(page);
    await setPlan(request, email, { usadas: 4950 });
    await cta(page).click();
    await expect(
      page.getByText(
        "A lista tem 184 CNPJs e você tem 50 verificações disponíveis. Remova linhas ou contrate um plano.",
      ),
    ).toBeVisible();
    await expect(cta(page)).toHaveAttribute("aria-disabled", "true");
  });

  test("a session that ended → /entrar with session.expired and the way back", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-sessao", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await preview(page);
    await expireSessions(request, email);
    await cta(page).click();
    await page.waitForURL(/\/entrar\?motivo=sessao&volta=%2Flote$/);
  });

  test("ADR-0008 Addendum 2: /lote's page owns startBatchAction", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as { node: Record<string, { exportedName?: string; workers: Record<string, unknown> }> };
    const entry = Object.values(manifest.node).find(
      (value) => value.exportedName === "startBatchAction",
    );
    expect(Object.keys(entry?.workers ?? {})).toContain(
      "app/(panel)/painel/(app)/lote/(inicio)/page",
    );
  });
});

test.describe("Server Action body limits (Security C1, C2) @feature-ops-panel @panel-lote", () => {
  const post = (url: string, id: string, body: string) => ({
    url,
    options: {
      headers: {
        "next-action": id,
        "content-type": "text/plain;charset=UTF-8",
        accept: "text/x-component",
      },
      data: body,
      maxRedirects: 0,
    },
  });

  test("over 1 MiB to any action but the panel's /lote → 413, on both hosts", async ({
    request,
  }) => {
    const big = JSON.stringify([{ x: "a".repeat(1.5 * MiB) }]);
    for (const [url, name] of [
      [`${PANEL_URL}/fila`, "startBatchAction"],
      [`${PANEL_URL}/entrar`, "loginAction"],
      [`${PANEL_URL}/LOTE`, "startBatchAction"],
      [`${LINK_URL}/v/loja-exemplo`, "startVerification"],
      [`${LINK_URL}/lote`, "startBatchAction"],
    ] as const) {
      const call = post(url, actionId(name), big);
      const response = await request.post(call.url, call.options);
      expect(response.status(), url).toBe(413);
    }
    // /lote/ never reaches middleware: Next's trailing-slash 308 comes first,
    // and the body is never processed there.
    const slash = post(`${PANEL_URL}/lote/`, actionId("startBatchAction"), big);
    expect([308, 413]).toContain(
      (await request.post(slash.url, slash.options)).status(),
    );
  });

  test("5,000 rows at the caps with 3-byte letters (2.28 MiB) reach startBatchAction on /lote; 2.5 MiB + 1 is refused by Next", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-limite", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    const linhas = Array.from({ length: 5000 }, (_, i) => ({
      cnpj: cnpjWithRoot(`7${String(i).padStart(7, "0")}0001`),
      responsavel: "語".repeat(120),
      ext_id: "x".repeat(64),
    }));
    const body = JSON.stringify([
      { idempotencyKey: "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b", linhas },
    ]);
    expect(Buffer.byteLength(body)).toBeGreaterThan(2 * MiB);
    expect(Buffer.byteLength(body)).toBeLessThan(2.5 * MiB);
    const id = actionId("startBatchAction");
    const ok = await page.request.post(`${PANEL_URL}/lote`, post("", id, body).options);
    expect(ok.status()).toBe(200);
    // It reached the API (pago has 3,760 left, so the mock answers 402).
    expect((await starts(request, email)).at(-1)?.rows).toBe(5000);

    const over = "x".repeat(2.5 * MiB + 1 - 4);
    const refused = await page.request.post(
      `${PANEL_URL}/lote`,
      post("", id, `["${over}"]`).options,
    );
    expect(refused.status()).toBeGreaterThanOrEqual(400);
    expect((await starts(request, email)).filter((call) => call.rows === 5000)).toHaveLength(1);
  });
});
