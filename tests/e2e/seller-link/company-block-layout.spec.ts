import { expect, test, type Page } from "@playwright/test";

import {
  LONG_NAME_CNPJ,
  LONG_RAZAO_SOCIAL,
} from "../../fixtures/factories/seller-link.ts";

// Review M1 v1 finding 0001: the autofill skeleton reserves the filled block's
// height, so the lookup result never moves the form (zero CLS). Checked by
// geometry, never by class names (design-conventions.md § Screen States Matrix).

const WIDTHS = [
  { name: "360 px phone", width: 360, height: 800 },
  { name: "1280 px desktop", width: 1280, height: 900 },
] as const;

/**
 * Holds every Server Action POST (the D2 lookup) until `release()` is called,
 * so the skeleton stays on screen long enough to measure.
 */
async function holdServerActions(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/v/**", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"])
      await gate;
    await route.continue();
  });
  return () => release();
}

test.describe("company block layout @feature-seller-link", () => {
  for (const { name, width, height } of WIDTHS) {
    test(`AC 7 at ${name}: the skeleton reserves the filled block's height, so the name field doesn't move`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      const release = await holdServerActions(page);
      await page.goto("/v/loja-exemplo");
      const nameField = page.getByRole("textbox", {
        name: "Nome completo do responsável",
      });
      const block = page.getByTestId("company-block");

      await page
        .getByRole("textbox", { name: "CNPJ da empresa" })
        .pressSequentially(LONG_NAME_CNPJ);
      await expect(block).toHaveAttribute("aria-busy", "true");
      const reserved = await block.boundingBox();
      const fieldBefore = await nameField.boundingBox();

      release();
      await expect(block).toContainText(LONG_RAZAO_SOCIAL);
      const filled = await block.boundingBox();
      const fieldAfter = await nameField.boundingBox();

      expect(filled?.height).toBe(reserved?.height);
      expect(fieldAfter?.y).toBe(fieldBefore?.y);
      // The razão social is the block's bold line (font-weight-strong).
      await expect(block.locator("p").first()).toHaveCSS("font-weight", "600");
    });
  }
});
