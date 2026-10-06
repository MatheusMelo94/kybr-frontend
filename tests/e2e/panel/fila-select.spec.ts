import { expect, test } from "@playwright/test";

import { caseFault, casesFor, seedCases } from "../fixtures/fila-mock.ts";
import { createAccount, logIn, uniqueEmail } from "../fixtures/panel-mock.ts";
import { twoFrames } from "../fixtures/fila-timing.ts";

// T99: selection — the listbox opens cases, /fila auto-selects the oldest at
// lg (D4), the case-switch skeleton, focus and scroll (AC 27 selection
// half, AC 41 deep-link half, AC 45 list half). The case heading is
// [data-detail-heading]:visible (D9: an h1 below lg, an h2 at lg, T100).

async function openIds(
  request: Parameters<typeof casesFor>[0],
  email: string,
): Promise<string[]> {
  return (await casesFor(request, email))
    .filter((c) => c.estado === "aberto")
    .map((c) => c.id);
}

test.describe("Fila selection (T99) @feature-ops-panel @panel-fila", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("at 1280 /fila becomes /fila/{oldest}, and that option is selected", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-auto", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [oldest] = await openIds(request, email);
    await logIn(page, email);
    await page.goto("/fila");
    await expect(page).toHaveURL(new RegExp(`/fila/${oldest}$`));
    await expect(page.getByRole("option", { selected: true })).toHaveCount(1);
    await expect(page.getByRole("option").first()).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // A deep link (auto-select included) moves no focus.
    await expect(page.locator("[data-detail-heading]:visible")).toBeVisible();
    await expect(
      page.locator("[data-detail-heading]:visible"),
    ).not.toBeFocused();
  });

  test("keyboard: Tab into the list, Down ×2, Enter → the third case, its heading focused", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-teclado", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "pc1");
    const ids = await openIds(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${ids[0]}`);
    const listbox = page.getByRole("listbox", { name: /^Para decidir/ });
    await expect(listbox).toBeVisible();
    // Tab from the active tab lands on the list (one tab stop).
    await page.getByRole("link", { name: /^Aguardando vendedor/ }).focus();
    await page.keyboard.press("Tab");
    await expect(listbox).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/fila/${ids[2]}$`));
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
    await expect(page.getByRole("option").nth(2)).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("a click opens the case; while it loads the detail shows the skeleton and the list stays", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-clique", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "pc1");
    const ids = await openIds(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${ids[0]}`);
    await expect(page.locator("[data-detail-heading]:visible")).toBeVisible();
    await caseFault(request, email, "case", "delay", { ms: 2_500, times: 1 });
    await page.getByRole("option").nth(1).click();
    await expect(
      page
        .getByTestId("fila-detail-skeleton")
        .filter({ visible: true })
        .first(),
    ).toBeVisible();
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(25);
    await expect(page).toHaveURL(new RegExp(`/fila/${ids[1]}$`), {
      timeout: 10_000,
    });
    await expect(page.getByTestId("fila-detail-skeleton")).toHaveCount(0);
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
  });

  test("the list's scroll comes back after the page remounts: item 20 stays in view", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-rolagem", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "pc1");
    const ids = await openIds(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${ids[0]}`);
    const item = page.getByRole("option").nth(20);
    await item.scrollIntoViewIfNeeded();
    await item.click();
    await expect(page).toHaveURL(new RegExp(`/fila/${ids[20]}$`));
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
    await expect(page.getByRole("option").nth(20)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("option").nth(20)).toBeInViewport();
  });
});

test.describe("Fila selection on phones (T99) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("below lg /fila stays the list; a deep link opens the case without moving focus", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-sel-fone", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const ids = await openIds(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${ids[1]}`);
    await expect(page.locator("[data-detail-heading]:visible")).toBeVisible();
    await expect(
      page.locator("[data-detail-heading]:visible"),
    ).not.toBeFocused();

    const wide = (page.viewportSize()?.width ?? 0) >= 1024;
    await page.goto("/fila");
    if (wide) {
      await expect(page).toHaveURL(new RegExp(`/fila/${ids[0]}$`));
    } else {
      await expect(page.getByRole("option")).toHaveCount(2);
      // P6-005: AutoSelectOldest's effect runs on the hydrating commit; once
      // the document loaded and two frames passed, it has had its chance.
      await page.waitForLoadState("load");
      await twoFrames(page);
      await expect(page).toHaveURL(/\/fila$/);
      await page.getByRole("option").nth(1).click();
      await expect(page).toHaveURL(new RegExp(`/fila/${ids[1]}$`));
      await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
    }
  });
});
