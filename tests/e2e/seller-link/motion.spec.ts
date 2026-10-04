import { expect, test, type Page } from "@playwright/test";

import { CASE_TOKENS, SLUGS } from "../../fixtures/factories/seller-link.ts";
import { createCase, setCaseState } from "../fixtures/mock-api.ts";

// T33 (spec § Motion Intent, AC 32; tech-design § 5): CSS-only motion. The
// page logs every transition and animation that starts, and every layout
// shift, so a test can say what moved and what didn't.

const VERIFYING = "Verificando sua empresa";
const APPROVED = "Tudo certo, Maria.";
const BAR = '[data-motion="indeterminate"]';

type MotionLog = {
  transitions: string[];
  animations: string[];
  layoutShift: number | null;
};

async function recordMotion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = {
      transitions: [] as string[],
      animations: [] as string[],
      layoutShift: null as number | null,
    };
    (window as unknown as { __motion: typeof log }).__motion = log;
    document.addEventListener("transitionrun", (event) => {
      log.transitions.push(event.propertyName);
    });
    document.addEventListener("animationstart", (event) => {
      log.animations.push(event.animationName);
    });
    // Layout Instability API: Chromium only; null elsewhere.
    if (
      PerformanceObserver.supportedEntryTypes?.includes("layout-shift") === true
    ) {
      log.layoutShift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[]) {
          if (!entry.hadRecentInput) log.layoutShift! += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    }
  });
}

function motionLog(page: Page): Promise<MotionLog> {
  return page.evaluate(
    () => (window as unknown as { __motion: MotionLog }).__motion,
  );
}

/** The CSS properties the bar's running animation's keyframes touch. */
function barKeyframeProperties(page: Page): Promise<string[]> {
  return page.locator(`${BAR} > *`).evaluate((bar) => {
    const meta = new Set(["offset", "computedOffset", "easing", "composite"]);
    return [
      ...new Set(
        bar
          .getAnimations()
          .flatMap((animation) =>
            (animation.effect as KeyframeEffect)
              .getKeyframes()
              .flatMap((frame) => Object.keys(frame)),
          )
          .filter((key) => !meta.has(key)),
      ),
    ];
  });
}

test.describe("motion @feature-seller-link", () => {
  test("AC 32: verificando's bar animates transform only, is gone on the result, and only the view's opacity and the step's scale transition, and the bar shifts no layout", async ({
    page,
    request,
  }) => {
    await recordMotion(page);
    const token = await createCase(request, { responsavel: "Maria Exemplo" });

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(
      page.getByRole("heading", { level: 1, name: VERIFYING }),
    ).toBeVisible();
    await expect(page.locator(BAR)).toBeVisible();
    await expect(page.locator(BAR)).toHaveAttribute("aria-hidden", "true");
    expect(await barKeyframeProperties(page)).toEqual(["transform"]);
    // A full --duration-loop of the bar shifts nothing. (The result view that
    // follows is taller and moves the privacy footer down: content, not
    // motion, so it isn't measured here.)
    await page.waitForTimeout(1_500);
    const whileVerifying = await motionLog(page);
    if (whileVerifying.layoutShift !== null) {
      expect(whileVerifying.layoutShift).toBe(0);
    }

    await setCaseState(request, token, { kind: "aprovado" });
    await expect(
      page.getByRole("heading", { level: 1, name: APPROVED }),
    ).toBeVisible({ timeout: 9_000 });

    await expect(page.locator(BAR)).toHaveCount(0);
    const log = await motionLog(page);
    expect(log.animations).toEqual(["indeterminate"]);
    // Tailwind 4's scale-x-* sets the individual `scale` transform property,
    // so the step segment's fill transitions `scale` (still transform only).
    expect(new Set(log.transitions)).toEqual(new Set(["opacity", "scale"]));
  });

  // Review 0022: the step fill marks a step change, never the first paint
  // (spec § Motion Intent: no entrance reveals).
  for (const [name, path] of [
    ["the form (step 1)", `/v/${SLUGS.ok}`],
    ["a reloaded result (step 3)", `/v/${SLUGS.ok}/c/${CASE_TOKENS.aprovado}`],
  ] as const) {
    test(`review 0022: nothing fills in on the first paint of ${name}`, async ({
      page,
    }) => {
      await recordMotion(page);

      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect((await motionLog(page)).transitions).toEqual([]);
    });
  }

  test("AC 32: the bar is gone on em análise", async ({ page, request }) => {
    const token = await createCase(request, { ageMs: 8_000 });

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(page.locator(BAR)).toBeVisible();

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Sua empresa está em análise",
      }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(BAR)).toHaveCount(0);
  });

  test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("AC 32: no bar on verificando, the status text stays, and the change to the result is instant", async ({
      page,
      request,
    }) => {
      await recordMotion(page);
      const token = await createCase(request, { responsavel: "Maria Exemplo" });

      await page.goto(`/v/${SLUGS.ok}/c/${token}`);
      await expect(
        page.getByRole("heading", { level: 1, name: VERIFYING }),
      ).toBeVisible();
      // The view's status line (the polite region says it too, T25).
      await expect(
        page.locator("p", {
          hasText: "Consultando Receita Federal, Simples Nacional e SINTEGRA…",
        }),
      ).toBeVisible();
      await expect(page.locator(BAR)).toBeHidden();

      await setCaseState(request, token, { kind: "aprovado" });
      const result = page.getByRole("heading", { level: 1, name: APPROVED });
      await expect(result).toBeVisible({ timeout: 9_000 });

      const log = await motionLog(page);
      expect(log.animations).toEqual([]);
      expect(log.transitions).toEqual([]);
      expect(
        await result.evaluate(
          (h1) => getComputedStyle(h1.parentElement!).transitionDuration,
        ),
      ).toBe("0s");
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(
        0,
      );
    });
  });
});
