import { expect, test, type Page } from "@playwright/test";

import { SLUGS } from "../../fixtures/factories/seller-link.ts";
import { expectNoAxeViolations } from "../fixtures/axe.ts";
import { createCase, setCaseState } from "../fixtures/mock-api.ts";
import {
  isCheck,
  isSameDocument,
  markDocument,
  nextCheck,
} from "../fixtures/live.ts";

const BANNER = "Sem conexão. Assim que a internet voltar, continuamos daqui.";

function banner(page: Page): ReturnType<Page["getByRole"]> {
  return page.getByRole("status").filter({ hasText: BANNER });
}

function h1(page: Page, name: string): ReturnType<Page["getByRole"]> {
  return page.getByRole("heading", { level: 1, name });
}

test.describe("offline @feature-seller-link", () => {
  test("AC 29 (verificando): the banner shows, the 10 s switch still happens offline, and checks resume online with no hard navigation", async ({
    page,
    context,
    request,
  }) => {
    const token = await createCase(request, { ageMs: 7_000 });

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(h1(page, "Verificando sua empresa")).toBeVisible();
    await markDocument(page);

    await context.setOffline(true);
    await expect(banner(page)).toBeVisible();
    await expectNoAxeViolations(page);

    await expect(h1(page, "Sua empresa está em análise")).toBeVisible({
      timeout: 6_000,
    });
    await expect(banner(page)).toBeVisible();
    expect(await isSameDocument(page)).toBe(true);

    const resumed = nextCheck(page);
    await context.setOffline(false);
    await resumed;
    await expect(page.getByText(BANNER)).toHaveCount(0);
    expect(await isSameDocument(page)).toBe(true);
  });

  test("AC 29 (em análise): a result reached while offline shows as soon as the connection returns", async ({
    page,
    context,
    request,
  }) => {
    const token = await createCase(request, {
      ageMs: 11_000,
      responsavel: "Maria Exemplo",
    });

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(h1(page, "Sua empresa está em análise")).toBeVisible();
    await markDocument(page);

    await context.setOffline(true);
    await expect(banner(page)).toBeVisible();
    await setCaseState(request, token, { kind: "aprovado" });

    const resumed = nextCheck(page);
    await context.setOffline(false);
    await resumed;

    const result = h1(page, "Tudo certo, Maria.");
    await expect(result).toBeVisible({ timeout: 5_000 });
    await expect(result).toBeFocused();
    await expect(page.getByText(BANNER)).toHaveCount(0);
    expect(await isSameDocument(page)).toBe(true);
  });

  test("Q2 (Architect-pending): a check that fails at the network level while the browser says online shows the banner; the next successful check hides it", async ({
    page,
    request,
  }) => {
    const token = await createCase(request);

    await page.goto(`/v/${SLUGS.ok}/c/${token}`);
    await expect(h1(page, "Verificando sua empresa")).toBeVisible();
    await markDocument(page);

    // Drop status checks at the network level; the browser stays "online".
    const dropChecks = async (
      route: Parameters<Parameters<Page["route"]>[1]>[0],
    ): Promise<void> => {
      if (route.request().headers()["next-action"])
        await route.abort("internetdisconnected");
      else await route.continue();
    };
    // Wait for the next check to fail, not a fixed window (review 0018).
    const dropped = page.waitForEvent("requestfailed", {
      predicate: isCheck,
      timeout: 15_000,
    });
    await page.route(`**/v/${SLUGS.ok}/c/${token}`, dropChecks);
    await dropped;

    await expect(banner(page)).toBeVisible();
    expect(await isSameDocument(page)).toBe(true);

    const answered = page.waitForEvent("requestfinished", {
      predicate: isCheck,
      timeout: 15_000,
    });
    await page.unroute(`**/v/${SLUGS.ok}/c/${token}`, dropChecks);
    await answered;
    await expect(page.getByText(BANNER)).toHaveCount(0);
    expect(await isSameDocument(page)).toBe(true);
  });
});
