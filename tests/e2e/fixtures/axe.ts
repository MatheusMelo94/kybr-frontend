import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// Accessibility gate for every state a journey reaches (QA test plan
// § Accessibility Cases; spec AC 35): any axe violation fails, in light and
// in dark. Automated checks are necessary, not sufficient (the manual
// keyboard pass stays with QA).

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Runs axe on the page as it is now, in both color schemes. */
export async function expectNoAxeViolations(page: Page): Promise<void> {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    // Controls cross-fade their colors (transition-colors, --duration-fast)
    // when the scheme flips: measure the settled colors, not a mid-fade frame.
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation instanceof CSSTransition)
          .map((animation) => animation.finished.catch(() => undefined)),
      ),
    );
    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();
    expect(
      violations.map(({ id, impact, nodes }) => ({
        colorScheme,
        id,
        impact,
        targets: nodes.map((node) => node.target.join(" ")),
      })),
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null });
}
