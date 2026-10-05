import { readFileSync } from "node:fs";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { MOCK_API } from "../fixtures/mock-api.ts";
import {
  callsFor,
  createAccount,
  createBatch,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T84: to the Fila and weekly monitoring (AC 23, AC 24 panel half; A-X7;
// PB6).

async function fault(
  request: APIRequestContext,
  email: string,
  endpoint: string,
  kind: string,
): Promise<void> {
  await request.post(`${MOCK_API}/__mock/panel/batch-fault`, {
    data: { email, endpoint, fault: kind },
  });
}

async function toQueueCalls(
  request: APIRequestContext,
  email: string,
): Promise<number> {
  return (await callsFor(request, email)).filter((call) =>
    call.path.endsWith("/to-queue"),
  ).length;
}

test.describe("Lote: actions @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("to the Fila: busy → toast → Abrir fila; the shell's Fila count rises; a reload shows Abrir fila", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-fila", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "misto-sem-erro", {
      finish: true,
    });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    const fila = page
      .locator("aside")
      .getByRole("link", { name: /^Fila de revisão/ });
    await expect(fila).toHaveAccessibleName(/^Fila de revisão 7 casos/);

    await page
      .getByRole("button", { name: "Mandar os 10 para a fila" })
      .dblclick();
    await expect(
      page.getByRole("status").filter({ hasText: "10 casos na fila" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Abrir fila" }),
    ).toHaveAttribute("href", "/fila");
    await expect(fila).toHaveAccessibleName(/^Fila de revisão 17 casos/);
    expect(await toQueueCalls(request, email)).toBe(1);

    await page.reload();
    await expect(page.getByRole("link", { name: "Abrir fila" })).toBeVisible();
  });

  test("a dropped call → lote.action.error next to the button; the retry creates the cases once", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-fila-erro", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "misto-sem-erro", {
      finish: true,
    });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    await fault(request, email, "to-queue", "500");
    const button = page.getByRole("button", {
      name: "Mandar os 10 para a fila",
    });
    await button.click();
    await expect(page.locator("main").getByRole("alert")).toHaveText(
      "Não deu certo. Tente de novo.",
    );
    await expect(button).toBeEnabled();
    await fault(request, email, "to-queue", "none");
    await button.click();
    await expect(page.getByRole("link", { name: "Abrir fila" })).toBeVisible();
    const fila = page
      .locator("aside")
      .getByRole("link", { name: /^Fila de revisão/ });
    await expect(fila).toHaveAccessibleName(/^Fila de revisão 17 casos/);
  });

  test("monitoring: → toast → the Monitoramento ativo pill (blue dot, ink text); kept on reload", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-monitor", testInfo);
    await createAccount(request, email, "pago");
    const id = await createBatch(request, email, "misto-sem-erro", {
      finish: true,
    });
    await logIn(page, email);
    await page.goto(`/lote/${id}`);
    await page
      .getByRole("button", { name: "Ativar monitoramento semanal" })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Monitoramento ativado para 40 vendedores" }),
    ).toBeVisible();
    const pill = page
      .locator("main")
      .getByText("Monitoramento ativo", { exact: true });
    await expect(pill).toBeVisible();
    const colors = await pill.evaluate((el) => {
      const dot = el.querySelector("[aria-hidden]") as HTMLElement;
      return {
        text: getComputedStyle(el).color,
        dot: getComputedStyle(dot).backgroundColor,
      };
    });
    expect(colors.dot).toBe("rgb(0, 102, 255)");
    await page.reload();
    await expect(
      page.locator("main").getByText("Monitoramento ativo", { exact: true }),
    ).toBeVisible();
  });

  test("no Atenção/Crítico rows → no to-queue button; no successful row → no monitoring button (PB18)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-sem-acoes", testInfo);
    await createAccount(request, email, "pago");
    const ok = await createBatch(request, email, "tudo-ok", { finish: true });
    const erro = await createBatch(request, email, "tudo-erro", {
      finish: true,
    });
    await logIn(page, email);
    await page.goto(`/lote/${ok}`);
    await expect(page.getByRole("button", { name: /para a fila/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Ativar monitoramento semanal" }),
    ).toBeVisible();
    await page.goto(`/lote/${erro}`);
    await expect(
      page.getByRole("button", { name: /para a fila|monitoramento/ }),
    ).toHaveCount(0);
  });

  test("ADR-0008 Addendum 2: /lote/[batchId]'s page owns both actions", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as {
      node: Record<
        string,
        { exportedName?: string; workers: Record<string, unknown> }
      >;
    };
    for (const name of ["sendToQueueAction", "monitorBatchAction"]) {
      const entry = Object.values(manifest.node).find(
        (value) => value.exportedName === name,
      );
      expect(Object.keys(entry?.workers ?? {}), name).toContain(
        "app/(panel)/painel/(app)/lote/[batchId]/page",
      );
    }
  });
});
