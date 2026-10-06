import { expect, test, type Page } from "@playwright/test";

import { FOREIGN_CASE_ID } from "../../fixtures/factories/panel.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { caseFault, seedCases } from "../fixtures/fila-mock.ts";
import {
  callsFor,
  createAccount,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T97: the Fila's routes, header, panes, skeletons and not-found
// (AC 28 loading half, AC 41 not-found half, AC 73; S5 banner rows).

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

/** Starts recording layout shifts before anything paints. */
async function recordShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __shift: number };
    w.__shift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & {
        value: number;
        hadRecentInput: boolean;
      })[])
        if (!entry.hadRecentInput) w.__shift += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
}

test.describe("Fila routes and shell (T97) @feature-ops-panel @panel-fila", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("/fila: fila.h1, fila.lead, the open and late pills, two panes", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-shell", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "tres-tardios-de-trinta");
    await logIn(page, email);
    await page.goto("/fila");
    // At lg /fila opens the oldest case (D4, T99): measure after it lands.
    await expect(page).toHaveURL(/\/fila\/[^/?]+$/);

    await expect(
      page.getByRole("heading", { level: 1, name: "Fila de revisão" }),
    ).toBeVisible();
    const main = page.locator("main");
    await expect(main.getByText("30 abertos", { exact: true })).toBeVisible();
    await expect(
      main.getByText("3 fora do prazo", { exact: true }),
    ).toBeVisible();
    const list = page.locator("[data-pane='list']");
    const detail = page.locator("[data-pane='detail']");
    await expect(list).toBeVisible();
    await expect(detail).toBeVisible();
    const [listBox, detailBox] = [
      await list.boundingBox(),
      await detail.boundingBox(),
    ];
    // List ≈ 2/5, detail ≈ 3/5, side by side.
    expect(listBox && detailBox && listBox.x < detailBox.x).toBe(true);
    const ratio =
      (listBox?.width ?? 0) / ((listBox?.width ?? 0) + (detailBox?.width ?? 1));
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.45);
    await expectNoAxeViolations(page);
  });

  test("loading: 5 list items and the detail skeleton, static; no layout shift when the list lands", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-skeleton", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "vinte-e-cinco");
    await logIn(page, email);
    await recordShifts(page);
    await caseFault(request, email, "list", "delay", { ms: 2_000, times: 1 });
    // "commit": the skeleton streams first; "load" would wait for the list.
    await page.goto("/fila", { waitUntil: "commit" });

    const skeleton = page.getByTestId("fila-list-skeleton");
    await expect(skeleton).toBeVisible();
    await expect(skeleton.locator("[data-skeleton-item]")).toHaveCount(5);
    await expect(
      page
        .getByTestId("fila-detail-skeleton")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(skeleton).toBeHidden({ timeout: 10_000 });
    expect(
      await page.evaluate(
        () => (window as unknown as { __shift: number }).__shift,
      ),
    ).toBe(0);
  });

  test("a case: fila.notfound for an unknown and a foreign id, the same markup, status 404", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-404", testInfo);
    await createAccount(request, email);
    await logIn(page, email);

    const markup: string[] = [];
    for (const id of [UNKNOWN_ID, FOREIGN_CASE_ID]) {
      const response = await page.goto(`/fila/${id}`);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: "Caso não encontrado" }),
      ).toBeVisible();
      await expect(
        page.getByText("Ele não existe ou não pertence a esta conta."),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Voltar para a fila" }),
      ).toHaveAttribute("href", "/fila");
      markup.push(await page.locator("main").innerHTML());
    }
    expect(markup[0]).toBe(markup[1]);
  });

  test("an id outside A-X3: not found with no case API call", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-bad-id", testInfo);
    await createAccount(request, email);
    await logIn(page, email);

    const response = await page.goto("/fila/curto");
    expect(response?.status()).toBe(404);
    const calls = await callsFor(request, email);
    expect(calls.some((call) => call.path.startsWith("/v1/cases/"))).toBe(
      false,
    );
  });

  test("a case opens in the detail pane beside the list", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-case", testInfo);
    await createAccount(request, email);
    const [first] = await seedCases(request, email, "um");
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await expect(
      page.locator("[data-pane='detail']").getByRole("heading", { level: 2 }),
    ).toHaveText("Empresa Exemplo 1 Ltda");
    await expect(page.locator("[data-pane='list']")).toBeVisible();
  });

  // T98: a list failure (here an invalid list) is ListError in the list
  // pane, no longer error.tsx; the mock has no trigger left for the segment
  // boundary (LoadError's own unit tests cover it).
  test("an invalid list → error.load.* in the list pane, the header kept", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-erro", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "um");
    await logIn(page, email);
    await caseFault(request, email, "list", "invalido", { times: 5 });
    await page.goto("/fila");
    const banner = page.locator("[data-pane='list']").getByRole("alert");
    await expect(banner).toContainText("Não carregou");
    await expect(
      banner.getByRole("button", { name: "Tentar de novo" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Fila de revisão" }),
    ).toBeVisible();
  });
});

test.describe("Fila panes on phones (T97) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("one pane: the list on /fila, the case on /fila/{id}", async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width: 360, height: 780 });
    const email = uniqueEmail("fila-phone", testInfo);
    await createAccount(request, email);
    const [first] = await seedCases(request, email, "um");
    await logIn(page, email);

    await page.goto("/fila");
    await expect(page.locator("[data-pane='list']")).toBeVisible();
    await expect(page.locator("[data-pane='detail']")).toBeHidden();

    await page.goto(`/fila/${first?.id}`);
    await expect(page.locator("[data-pane='list']")).toBeHidden();
    await expect(page.locator("[data-pane='detail']")).toBeVisible();
  });
});
