import { test } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";

// Review NIT 0033: Next 15 streams metadata on dynamic pages, so after an
// in-place refresh the <title> can land after the h1. The axe gate waits for
// a settled title instead of failing document-title on a mid-stream frame.
test.describe("axe gate @feature-seller-link", () => {
  test("NIT 0033: waits for a title that arrives after the content", async ({
    page,
  }) => {
    await page.setContent(
      '<!doctype html><html lang="pt-BR"><head></head><body><main><h1>Quase lá</h1></main></body></html>',
    );
    await page.evaluate(() => {
      setTimeout(() => {
        document.title = "Cadastro de vendedor";
      }, 300);
    });

    await expectNoAxeViolations(page);
  });
});
