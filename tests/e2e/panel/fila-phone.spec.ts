import { expect, test, type Page } from "@playwright/test";

import { casesFor, seedCases } from "../fixtures/fila-mock.ts";
import {
  createAccount,
  horizontalOverflow,
  LINK_URL,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T112 (AC 43, 74; spec § Responsive Behavior; QA A43-02/05/07, RF-02, Q18;
// Security F14): the Fila at 360 and 768. One pane chosen by the route,
// the decisions in a sticky bottom bar, the dialogs as bottom sheets, ≥ 44 px
// targets on coarse pointers, no page scroll at 320 or 200 % text.

type Request = Parameters<typeof casesFor>[0];

async function openCases(request: Request, email: string) {
  return (await casesFor(request, email)).filter((c) => c.estado === "aberto");
}

const bar = (page: Page) => page.locator("[data-case-actions]");
const options = (page: Page) => page.getByRole("listbox").getByRole("option");

function skipAtLg(page: Page): void {
  test.skip(
    (page.viewportSize()?.width ?? 0) >= 1024,
    "phone and tablet widths only",
  );
}

async function coarse(page: Page): Promise<boolean> {
  return page.evaluate(() => matchMedia("(pointer: coarse)").matches);
}

/** Every visible control under `scope` that is smaller than 44 × 44 px. */
async function smallTargets(page: Page, scope: string): Promise<string[]> {
  return page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (root === null) return [`no ${selector}`];
    const controls = root.querySelectorAll<HTMLElement>(
      "button, a[href], [role=option], input[type=checkbox], input[type=radio]",
    );
    const small: string[] = [];
    for (const control of controls) {
      // A checkbox or radio is hit through its label row.
      const target =
        control instanceof HTMLInputElement
          ? (control.closest("label") ?? control)
          : control;
      const box = target.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (getComputedStyle(target).visibility === "hidden") continue;
      if (box.width < 44 || box.height < 44)
        small.push(
          `${(target.textContent ?? control.outerHTML).trim().slice(0, 40)} ${Math.round(box.width)}×${Math.round(box.height)}`,
        );
    }
    return small;
  }, scope);
}

test.describe("the Fila on a phone (T112) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("AC 43: the list → a case full screen with fila.back → the sticky bar (Aprovar full width, Pedir documento | Bloquear) → a sheet → next case → the empty list", async ({
    page,
    request,
  }, testInfo) => {
    skipAtLg(page);
    const email = uniqueEmail("fila-phone", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await logIn(page, email);
    await page.goto("/fila");
    await expect(options(page)).toHaveCount(2);

    await options(page).first().click();
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(page.getByRole("listbox")).toBeHidden();
    await expect(
      page.getByRole("link", { name: "Voltar para a fila" }),
    ).toBeVisible();
    await expect(page.locator("h1:visible").first()).toBeVisible();

    // A43-02: the bar's layout and stickiness.
    await expect(bar(page)).toHaveCSS("position", "sticky");
    const approve = page.getByRole("button", { name: "Aprovar" });
    const ask = page.getByRole("button", { name: "Pedir documento" });
    const block = page.getByRole("button", { name: "Bloquear" });
    const [barBox, approveBox, askBox, blockBox] = await Promise.all(
      [bar(page), approve, ask, block].map((l) => l.boundingBox()),
    );
    const viewport = page.viewportSize() ?? { width: 360, height: 780 };
    expect(barBox?.width).toBeCloseTo(viewport.width, 0);
    expect((barBox?.y ?? 0) + (barBox?.height ?? 0)).toBeCloseTo(
      viewport.height,
      0,
    );
    expect(approveBox?.width).toBeGreaterThan((askBox?.width ?? 0) * 1.8);
    expect(askBox?.y).toBe(blockBox?.y);
    expect(askBox?.x ?? 0).toBeLessThan(blockBox?.x ?? 0);
    expect(askBox?.y ?? 0).toBeGreaterThan(approveBox?.y ?? 0);

    // The dialogs open as bottom sheets: full width, flush with the bottom.
    await block.focus();
    await block.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(async () => {
      const box = await sheet.boundingBox();
      expect(box?.width).toBeCloseTo(viewport.width, 0);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(
        viewport.height,
        0,
      );
    }).toPass();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // After a decision the next case opens, then the empty list.
    await approve.click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(page).toHaveURL(/\/fila$/);
    await expect(
      page.getByRole("heading", { name: "Nenhum caso aberto" }),
    ).toBeVisible();
  });

  test("A43-05: every control in the list, tabs, detail, bar and both sheets is ≥ 44 × 44 px on coarse pointers", async ({
    page,
    request,
  }, testInfo) => {
    skipAtLg(page);
    const email = uniqueEmail("fila-alvos", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    test.skip(!(await coarse(page)), "coarse pointers only");

    await page.goto("/fila");
    await expect(options(page)).toHaveCount(2);
    expect(await smallTargets(page, "main")).toEqual([]);

    await page.goto(`/fila/${first?.id}`);
    await expect(bar(page)).toBeVisible();
    expect(await smallTargets(page, "main")).toEqual([]);

    for (const name of ["Pedir documento", "Bloquear"]) {
      const trigger = page.getByRole("button", { name });
      await trigger.focus();
      await trigger.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      // The sheet slides in (T94): measure once it settled.
      await expect
        .poll(() => smallTargets(page, "dialog[open]"), { message: name })
        .toEqual([]);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    }
  });

  test("AC 74: no page scroll at the width, at 320 and at 200 % text; the last block is fully above the bar at the end (RF-02, Q18)", async ({
    page,
    request,
  }, testInfo) => {
    skipAtLg(page);
    const email = uniqueEmail("fila-reflow", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    const viewport = page.viewportSize() ?? { width: 360, height: 780 };

    for (const path of ["/fila", `/fila/${first?.id}`]) {
      await page.goto(path);
      await expect(page.locator("h1:visible").first()).toBeVisible();
      for (const [width, scale] of [
        [viewport.width, "100%"],
        [320, "100%"],
        [viewport.width, "200%"],
      ] as const) {
        await page.setViewportSize({ width, height: viewport.height });
        await page.evaluate((size) => {
          document.documentElement.style.fontSize = size;
        }, scale);
        expect(
          await horizontalOverflow(page),
          `${path} at ${width}px, ${scale} text`,
        ).toBeLessThanOrEqual(0);

        if (path === "/fila") continue;
        // Scroll to the end: the block before the bar ends above it.
        await page.evaluate(() =>
          window.scrollTo(0, document.documentElement.scrollHeight),
        );
        await expect(async () => {
          const layout = await page.evaluate(() => {
            const actions = document.querySelector<HTMLElement>(
              "[data-case-actions]",
            );
            const last = actions?.previousElementSibling;
            return {
              barTop: actions?.getBoundingClientRect().top ?? 0,
              barHeight: actions?.offsetHeight ?? 0,
              lastBottom: last?.getBoundingClientRect().bottom ?? Infinity,
              position: actions ? getComputedStyle(actions).position : "",
            };
          });
          expect(layout.lastBottom).toBeLessThanOrEqual(layout.barTop + 0.5);
          // Q18: a bar taller than a third of the viewport isn't sticky.
          expect(layout.position).toBe(
            layout.barHeight > viewport.height / 3 ? "static" : "sticky",
          );
          if (scale === "200%")
            testInfo.annotations.push({
              type: "RF-02 bar height at 200 %",
              description: `${layout.barHeight}px of ${viewport.height}px (${layout.position})`,
            });
        }).toPass();
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await page.setViewportSize(viewport);
    }
  });

  test("A43-07, F14: the panel's viewport meta has viewport-fit=cover and no zoom limit; /v/demo's has neither; theme-color and color-scheme are the same on both", async ({
    page,
  }) => {
    const meta = async () =>
      page.evaluate(() => ({
        viewport:
          document
            .querySelector('meta[name="viewport"]')
            ?.getAttribute("content") ?? "",
        theme: Array.from(
          document.querySelectorAll('meta[name="theme-color"]'),
          (m) => `${m.getAttribute("media")} ${m.getAttribute("content")}`,
        ),
        scheme:
          document
            .querySelector('meta[name="color-scheme"]')
            ?.getAttribute("content") ?? "",
      }));

    await page.goto("/entrar");
    const panel = await meta();
    expect(panel.viewport).toContain("viewport-fit=cover");
    expect(panel.viewport).not.toMatch(/maximum-scale|user-scalable/);

    await page.goto(`${LINK_URL}/v/demo`);
    const link = await meta();
    expect(link.viewport).not.toContain("viewport-fit");
    expect(link.viewport).not.toMatch(/maximum-scale|user-scalable/);

    expect(panel.theme).toEqual(link.theme);
    expect(panel.theme).toHaveLength(2);
    expect(panel.scheme).toBe(link.scheme);
  });
});
