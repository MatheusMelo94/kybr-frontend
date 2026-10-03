import { expect, test } from "@playwright/test";

const MOCK_API = "http://localhost:4010"; // playwright.config.ts

// Per-test slugs keep the 4 parallel projects apart: each one misses the 60 s
// D1 cache and owns its own S3 → S1 toggle.
function uniqueSlug(prefix: string, projectName: string): string {
  return `${prefix}-${projectName}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("form route boundaries @feature-seller-link", () => {
  test("AC 3: a malformed slug is Link not found, with a 404 status and no form", async ({
    page,
  }) => {
    const response = await page.goto("/v/Loja_Invalida");

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: "Link não encontrado" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });

  test("AC 3: an unknown or disabled slug is Link not found, with no form, and never indexed", async ({
    page,
  }) => {
    const response = await page.goto("/v/loja-inexistente");

    await expect(
      page.getByRole("heading", { level: 1, name: "Link não encontrado" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    // loading.tsx streams the skeleton before D1 answers, so the status is
    // already sent (200) when the slug turns out unknown. Crawlers still get
    // noindex from the header and Next's injected robots meta.
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]').first(),
    ).toBeAttached();
  });

  test("AC 4: a link-info failure shows loaderror.*, and Tentar de novo recovers", async ({
    page,
    request,
  }, testInfo) => {
    const slug = uniqueSlug("loja-instavel", testInfo.project.name);

    await page.goto(`/v/${slug}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Não conseguimos abrir o cadastro",
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Confira sua conexão e tente de novo."),
    ).toBeVisible();

    await request.post(`${MOCK_API}/__mock/links/${slug}/recover`);
    await page.getByRole("button", { name: "Tentar de novo" }).click();

    await expect(
      page.getByRole("heading", { level: 1, name: "Cadastro de vendedor" }),
    ).toBeVisible();
  });

  test("AC 2: a skeleton shows while the link info loads, with no layout shift", async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      const store = window as unknown as { __cls: number };
      store.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[]) {
          if (!entry.hadRecentInput) store.__cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto(`/v/${uniqueSlug("loja-lenta", testInfo.project.name)}`, {
      waitUntil: "commit",
    });
    await expect(page.getByTestId("form-skeleton")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Cadastro de vendedor" }),
    ).toBeVisible();
    await expect(page.getByTestId("form-skeleton")).toHaveCount(0);

    if (testInfo.project.name.startsWith("chromium")) {
      // Layout Instability API: Chromium only.
      expect(
        await page.evaluate(
          () => (window as unknown as { __cls: number }).__cls,
        ),
      ).toBe(0);
    }
  });
});
