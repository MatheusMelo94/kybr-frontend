import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import {
  caseSeed,
  casesFor,
  decideElsewhere,
  seedCases,
} from "../fixtures/fila-mock.ts";
import {
  callsFor,
  createAccount,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";
import { SETTLE, holdNextAction, twoFrames } from "../fixtures/fila-timing.ts";

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

const DECIDE_ERROR =
  "Não conseguimos registrar a decisão. O caso voltou para a fila. Tente de novo.";

function decideError(page: Page) {
  return page.getByRole("alert").filter({ hasText: DECIDE_ERROR });
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
  test("one click: the item leaves at once, the next is selected over a skeleton while the URL waits; then the toast, /fila/{next}, focus and counts @panel-smoke", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-aprovar", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await logIn(page, email);
    await page.goto("/fila");
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`), SETTLE);
    const tab = page.getByRole("link", { name: /^Para decidir/ });
    await expect(tab).toHaveText(/\(2\)$/);
    const nav = page
      .locator("aside")
      .getByRole("link", { name: /^Fila de revisão/ });
    await expect(nav).toHaveAccessibleName(/^Fila de revisão 2 casos/);

    const release = await holdNextAction(page, first?.id ?? "");
    await page.getByRole("button", { name: "Aprovar" }).click();
    const options = page.getByRole("listbox").getByRole("option");
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    // The visible detail pane's skeleton (an old instance may still be
    // streaming out of the DOM).
    await expect(
      page
        .locator("[data-pane='detail']")
        .getByTestId("fila-detail-skeleton")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    // D13 / F7: while the call is held, the URL stays on the owner and
    // nothing reports done.
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(
      page.getByRole("status").filter({ hasText: "Aprovado:" }),
    ).toHaveCount(0);
    expect(await decidePosts(request, email)).toHaveLength(0);
    release();

    await expect(
      page.getByRole("status").filter({
        hasText: `Aprovado: ${first?.razao_social}`,
      }),
    ).toContainText("Registrado na trilha de auditoria.");
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`), SETTLE);
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused(
      SETTLE,
    );
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
          SETTLE,
        );
      }
      // The empty /fila streams in after the last navigation (P6-005).
      await expect(
        page.locator("[data-detail-heading]:visible", {
          hasText: "Nenhum caso aberto",
        }),
      ).toBeFocused(SETTLE);
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

// T106: failure, unknown outcome and conflict (AC 34, 35; plan-m6 § 3.3;
// Security F5, F6). Every failure shows in place on /fila/{id} (D13).
test.describe("Fila decisions: failure, unknown outcome and conflict (T106) @feature-ops-panel @panel-fila", () => {
  test("an unknown outcome (503, M6C-01): back in place and selected, the alert above the actions, focus on the heading; no toast, same counts; the case re-read, and the second click succeeds with the same key", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-falha", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await caseSeed(request, email, "decide-falha", { n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    const tab = page.getByRole("link", { name: /^Para decidir/ });
    await expect(tab).toHaveText(/\(2\)$/);
    const approve = page.getByRole("button", { name: "Aprovar" });
    await approve.click();

    await expect(decideError(page)).toBeVisible();
    const options = page.getByRole("listbox").getByRole("option");
    await expect(options).toHaveCount(2);
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
    await expect(
      page.getByRole("status").filter({ hasText: "Aprovado:" }),
    ).toHaveCount(0);
    await expect(tab).toHaveText(/\(2\)$/);
    expect(
      await decideError(page).evaluate(
        (alert, button) =>
          (alert.compareDocumentPosition(button as Node) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
          0,
        await approve.elementHandle(),
      ),
    ).toBe(true);

    await approve.click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`), SETTLE);
    const keys = (await decidePosts(request, email)).map(
      (call) => call.idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  test("F6: a rejected action call shows the alert on its case, never fila/error.tsx", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-rejeitada", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await page.route(`**/fila/${first?.id}`, (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(decideError(page)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    // Attributed to the case it was for: its detail and actions are back.
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
    await expect(page.getByRole("button", { name: "Aprovar" })).toBeEnabled();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
  });

  test("F5: an unknown outcome that applied (decide-rede) shows decided after the re-read: no retry, no conflict notice", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-rede", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await caseSeed(request, email, "decide-rede", { n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(page.getByText(/^Decidido: Aprovado em /)).toBeVisible(SETTLE);
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(page.getByRole("button", { name: "Aprovar" })).toHaveCount(0);
    await expect(
      page.getByText(/^Este caso já tinha sido decidido/),
    ).toHaveCount(0);
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(
      1,
      SETTLE,
    );
    expect(await decidePosts(request, email)).toHaveLength(1);
  });

  test("F5: an unknown outcome that didn't apply (decide-queda): the alert, and the retry carries the same Idempotency-Key", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-queda", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await caseSeed(request, email, "decide-queda", { n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    const approve = page.getByRole("button", { name: "Aprovar" });
    await approve.click();
    await expect(decideError(page)).toBeVisible();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await approve.click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`), SETTLE);
    const keys = (await decidePosts(request, email)).map(
      (call) => call.idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  test("F6: no result within DECIDE_TIMEOUT_MS (decide-lento 16 s) → the alert in place; never reported done", async ({
    page,
    request,
  }, testInfo) => {
    test.slow();
    const email = uniqueEmail("fila-lento", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await caseSeed(request, email, "decide-lento", { ms: 16_000, n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    // The positive marker (P6-005): the late action's own response.
    const late = page.waitForResponse(
      (response) =>
        response.request().headers()["next-action"] !== undefined &&
        (response.request().postData() ?? "").includes(first?.id ?? ""),
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(decideError(page)).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await late;
    await twoFrames(page);
    await expect(
      page.getByRole("status").filter({ hasText: "Aprovado:" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
  });

  test("409 (decided elsewhere): the decided state with fila.decide.conflict, out of the list after the refresh; no toast, no navigation", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-conflito", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    const approve = page.getByRole("button", { name: "Aprovar" });
    await expect(approve).toBeVisible();
    await decideElsewhere(request, first?.id ?? "");
    await approve.click();

    await expect(
      page.getByText(/^Este caso já tinha sido decidido em /),
    ).toBeVisible(SETTLE);
    await expect(page.getByText(/^Decidido: Aprovado em /)).toBeVisible(SETTLE);
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
    // P6-003: focus on the case's heading, not <body>.
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(
      page.getByRole("status").filter({ hasText: "Aprovado:" }),
    ).toHaveCount(0);
    await expect(decideError(page)).toHaveCount(0);
  });
});
