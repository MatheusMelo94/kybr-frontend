import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  createAccount,
  createBatch,
  logIn,
  setPlan,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T85: the stopped batch and "Verificar os que faltam" (AC 22; PB4).

test.describe("Lote: a stopped batch @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("seen live: an alert with what was done; Verificar os que faltam resumes it to the end; usage rises by the successes only", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-parou", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "falha");
    await logIn(page, email);
    await page.goto(`/lote/${id}`);

    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toHaveText("A verificação parou no meio", { timeout: 15_000 });
    await expect(
      page.getByText("3 de 6 CNPJs foram consultados. Os que faltam não consumiram verificações."),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Verificar os que faltam" }).click();
    await expect(page.getByRole("heading", { name: "Resultado" })).toBeVisible({
      timeout: 20_000,
    });
    // pago starts at 1,240 used: 6 reserved, 3 released when it stopped, 3
    // reserved again, and the 2 erro rows released at the end → +4.
    await expect(
      page.locator("aside").getByText("1.244 de 5.000 verificações neste ciclo"),
    ).toBeVisible();
  });

  test("a cold load isn't an alert; with no checks left, the resume shows plan.exhausted (alert) and stays usable", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-parou-saldo", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "falha", { finish: true });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    await expect(page.getByRole("heading", { name: "A verificação parou no meio" })).toBeVisible();
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);

    await setPlan(request, email, { usadas: 5000 });
    const button = page.getByRole("button", { name: "Verificar os que faltam" });
    await button.click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "As verificações do plano acabaram. Contrate para continuar verificando.",
    );
    await expect(button).toBeEnabled();
  });

  test("ADR-0008 Addendum 2: /lote/[batchId]'s page owns resumeBatchAction", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as { node: Record<string, { exportedName?: string; workers: Record<string, unknown> }> };
    const entry = Object.values(manifest.node).find(
      (value) => value.exportedName === "resumeBatchAction",
    );
    expect(Object.keys(entry?.workers ?? {})).toContain(
      "app/(panel)/painel/(app)/lote/[batchId]/page",
    );
  });
});
