import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { caseSeed, casesFor, seedCases } from "../fixtures/fila-mock.ts";
import {
  callsFor,
  createAccount,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T105: Aprovar / Manter aprovado (AC 31 action half, AC 33; plan-m6 § 3.3,
// D13 "await, then navigate"; Security F5, F6, F7; risk R1). The case
// heading is [data-detail-heading]:visible (D9).

type Request = Parameters<typeof casesFor>[0];

async function openCases(request: Request, email: string) {
  return (await casesFor(request, email)).filter((c) => c.estado === "aberto");
}

async function decidePosts(request: Request, email: string) {
  return (await callsFor(request, email)).filter(
    (call) => call.method === "POST" && /\/decide$/.test(call.path),
  );
}

/** Full document loads after the start (a soft navigation makes none). */
function countLoads(page: Page): () => number {
  let loads = 0;
  page.on("load", () => {
    loads += 1;
  });
  return () => loads;
}

test.describe("Fila decisions: Aprovar (T105) @feature-ops-panel @panel-fila", () => {
  test("one click: the item leaves at once, the next is selected over a skeleton while the URL waits; then the toast, /fila/{next}, focus and counts", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-aprovar", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await caseSeed(request, email, "decide-lento", { ms: 1_500, n: 1 });
    await logIn(page, email);
    await page.goto("/fila");
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    const tab = page.getByRole("link", { name: /^Para decidir/ });
    await expect(tab).toHaveText(/\(2\)$/);
    const nav = page
      .locator("aside")
      .getByRole("link", { name: /^Fila de revisão/ });
    await expect(nav).toHaveAccessibleName(/^Fila de revisão 2 casos/);

    await page.getByRole("button", { name: "Aprovar" }).click();
    const options = page.getByRole("listbox").getByRole("option");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("fila-detail-skeleton")).toBeVisible();
    // D13 / F7: the URL stays on the owner until the result arrives.
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(
      page.getByRole("status").filter({ hasText: "Aprovado:" }),
    ).toHaveCount(0);

    await expect(
      page.getByRole("status").filter({
        hasText: `Aprovado: ${first?.razao_social}`,
      }),
    ).toContainText("Registrado na trilha de auditoria.");
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
    await expect(tab).toHaveText(/\(1\)$/);
    await expect(nav).toHaveAccessibleName(/^Fila de revisão 1 caso/);
  });

  test("Manter aprovado on an alert: toast.kept", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-manter", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "cada-tipo");
    const alerta = (await openCases(request, email)).find(
      (c) => c.kind === "alerta",
    );
    await logIn(page, email);
    await page.goto(`/fila/${alerta?.id}`);
    await page.getByRole("button", { name: "Manter aprovado" }).click();
    await expect(
      page.getByRole("status").filter({
        hasText: `Mantido como aprovado: ${alerta?.razao_social}`,
      }),
    ).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`/fila/${alerta?.id}$`));
  });

  test("F5: after a dropped connection the retry carries the same Idempotency-Key and gets the first result (PC22)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-rede", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await caseSeed(request, email, "decide-rede", { n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    const approve = page.getByRole("button", { name: "Aprovar" });
    await approve.click();
    // The unknown outcome: back in place, no navigation (T106 adds the alert).
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
    const keys = (await decidePosts(request, email)).map(
      (call) => call.idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  test("R1 gate: Aprovar / Manter 25 times in a row at 1280, every navigation soft (no full-load fallback)", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);
    const email = uniqueEmail("fila-r1", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "vinte-e-cinco");
    const ids = (await openCases(request, email)).map((c) => c.id);
    expect(ids).toHaveLength(25);
    await logIn(page, email);
    await page.goto(`/fila/${ids[0]}`);
    await expect(page.locator("[data-detail-heading]:visible")).toBeVisible();
    const loads = countLoads(page);
    const diag: string[] = [];
    const t0 = Date.now();
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame())
        diag.push(`${Date.now() - t0} framenavigated ${f.url()}`);
    });
    page.on("load", () => diag.push(`${Date.now() - t0} LOAD ${page.url()}`));
    // R1 diagnosis (T105): the navigations, loads and clicks, attached.
    const dump = () =>
      testInfo.attach("r1-navigations", {
        body: `${diag.join("\n")}\nIDS ${ids.join(",")}`,
        contentType: "text/plain",
      });
    try {
      for (const [i, id] of ids.entries()) {
        await expect(page).toHaveURL(new RegExp(`/fila/${id}$`));
        diag.push(`${Date.now() - t0} CLICK ${i} ${id}`);
        // Alerts (origem monitoramento) carry Manter aprovado instead.
        await page
          .getByRole("button", { name: /^(Aprovar|Manter aprovado)$/ })
          .click();
        const next = ids[i + 1];
        await expect(page).toHaveURL(
          next === undefined ? /\/fila$/ : new RegExp(`/fila/${next}$`),
        );
      }
      await expect(
        page.locator("[data-detail-heading]:visible", {
          hasText: "Nenhum caso aberto",
        }),
      ).toBeFocused();
    } finally {
      await dump();
    }
    testInfo.annotations.push({
      type: "R1 fallbacks",
      description: String(loads()),
    });
    expect(loads()).toBe(0);
    expect(await decidePosts(request, email)).toHaveLength(25);
  });

  test("ADR-0008 Addendum 2 / F7: decideAction is owned by /fila/[caseId]'s page only", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as {
      node: Record<
        string,
        { exportedName?: string; workers: Record<string, unknown> }
      >;
    };
    const entry = Object.values(manifest.node).find(
      (value) => value.exportedName === "decideAction",
    );
    const workers = Object.keys(entry?.workers ?? {});
    expect(workers).toContain("app/(panel)/painel/(app)/fila/[caseId]/page");
    expect(workers).not.toContain("app/(panel)/painel/(app)/fila/page");
  });
});

test.describe("Fila decisions: the last case (T105, F7) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("deciding the last case of Para decidir succeeds from /fila/{id} and shows the empty state", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-ultimo", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "um");
    const [only] = await openCases(request, email);
    const statuses: number[] = [];
    page.on("response", (response) => {
      if (response.request().method() === "POST")
        statuses.push(response.status());
    });
    await logIn(page, email);
    await page.goto(`/fila/${only?.id}`);
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(page).toHaveURL(/\/fila$/);
    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    if (wide)
      await expect(
        page.locator("[data-detail-heading]:visible", {
          hasText: "Nenhum caso aberto",
        }),
      ).toBeFocused();
    else
      await expect(
        page.getByRole("heading", { name: "Nenhum caso aberto" }),
      ).toBeVisible();

    const [post] = await decidePosts(request, email);
    expect(post?.pagePath).toBe(`/fila/${only?.id}`);
    expect(statuses).not.toContain(404);
    expect(statuses.every((status) => status < 400)).toBe(true);
  });
});
