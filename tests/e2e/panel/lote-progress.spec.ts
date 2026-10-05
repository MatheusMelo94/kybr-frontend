import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  advanceBatch,
  callsFor,
  createAccount,
  createBatch,
  holdBatch,
  logIn,
  seed,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T81: progress and polling on /lote/[batchId] (AC 19; ADR-0011 rule 3;
// M4-02 / C7: polls don't slide the session).

test.describe("Lote: progress @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("a held batch shows its progress; advancing moves the count and the bar; polls carry X-Kybr-Poll; axe clean", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-progresso", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { hold: true });
    await logIn(page, email);
    await page.goto("/lote");
    await page.waitForURL(`**/lote/${id}`);

    const heading = page.getByRole("heading", { name: "Verificando 184 CNPJs" });
    await expect(heading).toBeFocused();
    const bar = page.getByRole("progressbar", { name: "Verificando 184 CNPJs" });
    await expect(bar).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator("main p").getByText("0 de 184", { exact: true })).toBeVisible();
    await expectNoAxeViolations(page);

    await advanceBatch(request, id, 92);
    await expect(page.locator("main p").getByText("92 de 184", { exact: true })).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuenow", "92");

    const polled = (await callsFor(request, email)).filter(
      (call) => call.path === `/v1/batches/${id}` && call.authorized,
    );
    // The page's server render reads it once (layout + page share it); every
    // other read is BatchProgress's poll.
    expect(polled.filter((call) => call.poll !== true)).toHaveLength(1);
    expect(polled.filter((call) => call.poll === true).length).toBeGreaterThan(0);
  });

  test("failed polls show lote.progress.stale with the last numbers, then recover by themselves (PB11)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-stale", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { hold: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    await seed(request, "lote-poll-falha", email, { n: 2 });
    const stale = page.getByText("Reconectando… Os números voltam a atualizar sozinhos.");
    await expect(stale).toBeVisible();
    await expect(page.locator("main p").getByText("0 de 184", { exact: true })).toBeVisible();
    await expect(stale).toBeHidden({ timeout: 10_000 });
  });

  test("the end: one refresh to the result; the nav's Verificando clears", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-fim", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "tudo-ok", { hold: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    await expect(
      page.locator("aside").getByRole("link", { name: "Verificar em lote Verificando" }),
    ).toBeVisible();
    await holdBatch(request, id, false);
    await expect(page.getByRole("heading", { name: "Resultado" })).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("aside").getByRole("link", { name: "Verificar em lote" }),
    ).toHaveAccessibleName("Verificar em lote");
  });

  test("away to the Fila and back through the nav: the same batch's progress (D1)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-volta", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "ac16", { hold: true });
    await advanceBatch(request, id, 46);
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    const aside = page.locator("aside");
    await aside.getByRole("link", { name: /^Fila de revisão/ }).click();
    await page.waitForURL("**/fila");
    await aside.getByRole("link", { name: "Verificar em lote Verificando" }).click();
    await page.waitForURL(`**/lote/${id}`);
    await expect(page.locator("main p").getByText("46 de 184", { exact: true })).toBeVisible();
  });

  test("ADR-0008 Addendum 2: /lote/[batchId]'s page owns pollBatchAction", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as { node: Record<string, { exportedName?: string; workers: Record<string, unknown> }> };
    const entry = Object.values(manifest.node).find(
      (value) => value.exportedName === "pollBatchAction",
    );
    expect(Object.keys(entry?.workers ?? {})).toContain(
      "app/(panel)/painel/(app)/lote/[batchId]/page",
    );
  });
});
