import { expect, test } from "@playwright/test";

import { CASE_TOKENS, SLUGS } from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";

// Link AC 40 (brand v1, DDR-0002): every /v/* screen ends with "Verificação
// por" + the inline wordmark, centered, not a link, not focusable, read as
// "Verificação por Kybr", at 360 / 768 / 1280 in light and dark. AC 19's
// seal is signed the same way.

const SCREENS = [
  ["the form", `/v/${SLUGS.ok}`],
  ["the tudo certo case", `/v/${SLUGS.ok}/c/${CASE_TOKENS.aprovado}`],
  ["the privacy notice", `/v/${SLUGS.ok}/privacidade`],
  ["the root not-found", "/v/x/y/z/nada"],
] as const;

for (const scheme of ["light", "dark"] as const)
  for (const width of [360, 768, 1280])
    test.describe(`the Kybr footer, ${scheme}, ${width} px @feature-seller-link`, () => {
      test.use({ colorScheme: scheme, viewport: { width, height: 900 } });

      for (const [name, path] of SCREENS)
        test(`${name} ends with it, centered, after main`, async ({ page }) => {
          await page.goto(path);
          const footer = page.getByRole("contentinfo");
          await expect(footer).toHaveText("Verificação por");
          await expect(footer.getByRole("img", { name: "Kybr" })).toBeVisible();
          await expect(footer.locator("a, button, [tabindex]")).toHaveCount(0);

          const main = await page.getByRole("main").boundingBox();
          const box = await footer.boundingBox();
          expect(box?.y ?? 0).toBeGreaterThanOrEqual(
            (main?.y ?? 0) + (main?.height ?? 0) - 1,
          );
          // Centered: the text's mid-point is the viewport's.
          const mid = await footer.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            const rect = range.getBoundingClientRect();
            return rect.left + rect.width / 2;
          });
          expect(Math.abs(mid - width / 2)).toBeLessThanOrEqual(2);
          if (width === 360) await expectNoAxeViolations(page);
        });
    });

test("AC 19: the seal reads 'Vendedor verificado por Kybr', its words in ink @feature-seller-link", async ({
  page,
}) => {
  await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.aprovado}`);
  const seal = page
    .getByText("Vendedor verificado", { exact: true })
    .locator("xpath=..");
  await expect(seal).toHaveText("Vendedor verificado por");
  await expect(seal.getByRole("img", { name: "Kybr" })).toBeVisible();
  const ink = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(
    await seal
      .getByText("Vendedor verificado")
      .evaluate((element) => getComputedStyle(element).color),
  ).toBe(ink);
});

test("B5 / B6: the CNPJ input is 16 px text in tabular figures @feature-seller-link", async ({
  page,
}) => {
  await page.goto(`/v/${SLUGS.ok}`);
  const cnpj = page.getByRole("textbox", { name: "CNPJ da empresa" });
  const [variant, size] = await cnpj.evaluate((element) => {
    const computed = getComputedStyle(element);
    return [computed.fontVariantNumeric, computed.fontSize];
  });
  expect(variant).toContain("tabular-nums");
  expect(size).toBe("16px");
});

test("DDR-0003: the confirmation pills' words are ink; the green is the dot only @feature-seller-link", async ({
  page,
}) => {
  await page.goto(`/v/${SLUGS.ok}/c/${CASE_TOKENS.aprovado}`);
  const ink = await page.evaluate(() => getComputedStyle(document.body).color);
  const pills = page.getByRole("listitem").locator("span:has(> [aria-hidden])");
  await expect(pills).toHaveCount(3);
  for (const pill of await pills.all()) {
    const [color, background] = await pill.evaluate((element) => [
      getComputedStyle(element).color,
      getComputedStyle(element).backgroundColor,
    ]);
    expect(color).toBe(ink);
    const dot = await pill
      .locator("[aria-hidden]")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(dot).not.toBe(background);
  }
});
