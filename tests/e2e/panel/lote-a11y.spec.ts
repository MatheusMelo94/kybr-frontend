import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  chooserByKeyboard,
  dropZoneHydrated,
  forEachLoteBatchState,
  forEachLoteUploadState,
  pickLoteFile,
  visit,
} from "../fixtures/lote-states.ts";
import {
  createAccount,
  createBatch,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T87: Lote at 1280, 768 and 360 (AC 69, 70, 71, 74, 76; spec § Responsive
// Behavior, best-effort at 360/768 for S7): axe on every state in both
// themes, no page scroll at 320 or at 200 % text, the one-column reflow and
// the coarse-pointer drop zone, the J3 keyboard path, reduced motion, and
// tabular figures.

const isDesktop = (page: Page): boolean =>
  (page.viewportSize()?.width ?? 1280) >= 1024;

/** No page scroll at the current width, at 320 px and at 200 % text (AC 74). */
async function expectReflow(page: Page, label: string): Promise<void> {
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  for (const [width, scale] of [
    [viewport.width, "100%"],
    [320, "100%"],
    [viewport.width, "200%"],
  ] as const) {
    await page.setViewportSize({ width, height: viewport.height });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, scale);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow, `${label}: ${width}px, ${scale} text`).toBeLessThanOrEqual(
      0,
    );
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize(viewport);
}

/** Below lg: every visible control in main is at least 44 px tall and wide enough to hit (AC 71). */
async function expectTargets(page: Page, label: string): Promise<void> {
  const small = await page.locator("main").evaluate((main) =>
    [...main.querySelectorAll<HTMLElement>("button, a[href], select, input:not([type=file]), [role=region][tabindex]")]
      .filter((element) => element.getClientRects().length > 0)
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.visibility !== "hidden" && !element.closest(".sr-only");
      })
      // Links inside running text and table cells are exempt (WCAG 2.5.8 inline).
      .filter((element) => !(element.tagName === "A" && element.closest("p, td")))
      .filter((element) => element.getBoundingClientRect().height < 44)
      .map((element) => `${element.tagName} "${element.textContent?.trim().slice(0, 30) ?? ""}" ${Math.round(element.getBoundingClientRect().height)}px`),
  );
  expect(small, `${label}: targets under 44 px`).toEqual([]);
}

async function check(page: Page, label: string): Promise<void> {
  await expectNoAxeViolations(page);
  await expectReflow(page, label);
  if (!isDesktop(page)) await expectTargets(page, label);
}

test.describe("Lote: responsive and accessible @feature-ops-panel @panel-lote @panel-phone", () => {
  test.setTimeout(180_000);

  test("every /lote state: axe in light and dark, reflow at 320 and 200 %, targets on coarse pointers", async ({
    page,
    request,
  }, testInfo) => {
    await forEachLoteUploadState(page, request, testInfo, (label) =>
      check(page, label),
    );
  });

  test("every /lote/{id} state: axe in light and dark, reflow at 320 and 200 %, targets on coarse pointers", async ({
    page,
    request,
  }, testInfo) => {
    await forEachLoteBatchState(page, request, testInfo, (label) =>
      check(page, label),
    );
  });

  test("below lg: one column (the side cards after the main column), the drop zone without drag text, tables scrolling inside their card", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(isDesktop(page), "the phone and tablet projects only");
    const email = uniqueEmail("lote-reflow", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await visit(page, "/lote");
    const main = page.locator("main");

    const drop = main.getByRole("button", { name: "Escolher arquivo" });
    await expect(drop).toBeVisible();
    await expect(
      main.getByText("Arraste uma planilha ou escolha o arquivo"),
    ).toBeHidden();
    await expect(
      main.getByText("CSV ou Excel com uma coluna de CNPJ. Até 5.000 linhas."),
    ).toBeVisible();

    const why = main.getByRole("heading", { name: "O que isso resolve" });
    const dropBox = await drop.boundingBox();
    const whyBox = await why.boundingBox();
    expect(whyBox?.y ?? 0).toBeGreaterThan(dropBox?.y ?? Infinity);
    expect(Math.abs((whyBox?.x ?? 0) - (dropBox?.x ?? 0))).toBeLessThan(40);

    await pickLoteFile(page, "ac16.csv");
    const table = main.getByRole("region", { name: "Confira antes de verificar" }).getByRole("region");
    const scrolls = await table.first().evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    );
    const viewport = page.viewportSize()?.width ?? 0;
    if (viewport < 560) expect(scrolls).toBe(true);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });

  test("J3 keyboard only at 1280: file → preview → CTA → progress → result → downloads and actions → filter → table → history, focus always visible", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(!isDesktop(page), "the desktop project only");
    test.setTimeout(120_000);
    const email = uniqueEmail("lote-teclado", testInfo);
    await createAccount(request, email, "pago");
    await createBatch(request, email, "tudo-ok", { finish: true });
    await logIn(page, email);
    await visit(page, "/lote");

    /** Tabs until `name` has focus; every stop must show a focus indicator. */
    async function tabTo(name: RegExp, max = 40): Promise<void> {
      const seen: string[] = [];
      for (let i = 0; i < max; i++) {
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const element = document.activeElement as HTMLElement | null;
          if (element === null || element === document.body) return null;
          const style = getComputedStyle(element);
          const visible =
            (style.outlineStyle !== "none" && style.outlineWidth !== "0px") ||
            style.boxShadow !== "none";
          return {
            name:
              element.getAttribute("aria-label") ??
              (element as HTMLSelectElement).labels?.[0]?.textContent?.trim() ??
              element.textContent?.trim() ??
              "",
            visible,
          };
        });
        if (focused === null) continue;
        expect(focused.visible, `focus visible on "${focused.name}"`).toBe(
          true,
        );
        if (name.test(focused.name)) return;
        seen.push(focused.name.slice(0, 40));
      }
      throw new Error(`never reached ${name}: ${seen.join(" | ")}`);
    }

    await dropZoneHydrated(page);
    await tabTo(/^Escolher arquivo$/);
    const chooser = await chooserByKeyboard(page);
    await chooser.setFiles("tests/fixtures/files/lote/ac16.csv");
    await expect(
      page.getByRole("heading", { name: "Confira antes de verificar" }),
    ).toBeFocused();
    await tabTo(/^Confira antes de verificar$/);
    await tabTo(/CNPJ/);
    await expect(
      page.getByRole("combobox", { name: "Coluna do CNPJ" }),
    ).toBeFocused();
    await tabTo(/^Verificar 184 CNPJs$/);
    await page.keyboard.press("Enter");

    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resultado" })).toBeFocused({
      timeout: 30_000,
    });
    // The table streams in behind its Suspense boundary; focus stays put.
    await expect(page.getByRole("combobox", { name: "Mostrar" })).toBeVisible();
    await tabTo(/^Baixar erros \(CSV\)$/);
    await tabTo(/^Baixar resultado \(CSV\)$/);
    await tabTo(/^Mandar os \d+ para a fila$/);
    await tabTo(/^Ativar monitoramento semanal$/);
    await tabTo(/^Mostrar/);
    await tabTo(/^Resultado$/);
    await visit(page, "/lote");
    await tabTo(/^Escolher arquivo$/);
    await tabTo(/CNPJs/);
    await expect(page.locator(":focus")).toHaveAttribute("href", /\/lote\//);
  });

  test("reduced motion: the bar has no transition (AC 70); counts and CNPJs are tabular (AC 76)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-movimento", testInfo);
    await createAccount(request, email, "pago");
    const running = await createBatch(request, email, "ac16", { hold: true });
    const done = await createBatch(request, email, "ac16", { finish: true });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await logIn(page, email);

    await visit(page, `/lote/${running}`);
    const fill = page.getByRole("progressbar").locator("> *").first();
    const motion = await fill.evaluate((element) => {
      const style = getComputedStyle(element);
      return { property: style.transitionProperty, duration: style.transitionDuration };
    });
    expect(
      motion.property === "none" ||
        motion.duration.split(",").every((value) => parseFloat(value) === 0),
      JSON.stringify(motion),
    ).toBe(true);
    await expect(
      page.locator("main p").getByText("0 de 184", { exact: true }),
    ).toHaveCSS(
      "font-variant-numeric",
      "tabular-nums",
    );

    await visit(page, `/lote/${done}`);
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "Resultado" })).toBeVisible();
    const notTabular = await main.evaluate((root) =>
      [...root.querySelectorAll<HTMLElement>("p, li, td, dd, span")]
        .filter((element) =>
          [...element.childNodes].some(
            (node) =>
              node.nodeType === Node.TEXT_NODE &&
              /\d/.test(node.textContent ?? ""),
          ),
        )
        .filter(
          (element) =>
            !getComputedStyle(element).fontVariantNumeric.includes(
              "tabular-nums",
            ),
        )
        .map((element) => element.textContent?.trim().slice(0, 40)),
    );
    expect(notTabular).toEqual([]);
  });
});
