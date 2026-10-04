import { expect, test } from "@playwright/test";

import { CASE_TOKENS, SLUGS } from "../../fixtures/factories/seller-link.ts";

// QA-M2-002 / Q7: the case page focuses its h1 (tabindex=-1) on load and on
// every view change. That heading gets the --color-focus ring, solid with an
// offset, like every control (FA § Accessibility), never the UA outline.

for (const [scheme, focus] of [
  ["light", "rgb(20, 20, 20)"],
  ["dark", "rgb(245, 245, 245)"],
] as const) {
  test.describe(`${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`Q7: the focused h1 shows the --color-focus ring with an offset (${scheme}) @feature-seller-link`, async ({
      page,
    }) => {
      await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.aprovado}`);
      // This sandbox's Firefox ignores the colorScheme emulation; skip rather
      // than assert the light ring under a "dark" label.
      test.skip(
        !(await page.evaluate(
          (wanted) => matchMedia(`(prefers-color-scheme: ${wanted})`).matches,
          scheme,
        )),
        `this browser doesn't emulate prefers-color-scheme: ${scheme}`,
      );

      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toBeFocused();
      const ring = await h1.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          style: style.outlineStyle,
          width: style.outlineWidth,
          color: style.outlineColor,
          offset: style.outlineOffset,
        };
      });

      expect(ring).toEqual({
        style: "solid",
        width: "2px",
        color: focus,
        offset: "2px",
      });
    });
  });
}
