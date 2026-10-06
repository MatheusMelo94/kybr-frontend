import { expect, test, type Page } from "@playwright/test";

import { casesFor, decideElsewhere, seedCases } from "../fixtures/fila-mock.ts";
import {
  callsFor,
  createAccount,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T111: offline (AC 44; D8; ADR-0011 rule 8; F10 residual; F14). The tree
// stays; decisions, list activation, the tabs, Mostrar and Carregar mais
// are disabled; on reconnect one re-read, offline.back, and the poll.

type Request = Parameters<typeof casesFor>[0];

const OFFLINE_ACTIONS = "As decisões voltam quando a internet voltar.";

async function openCases(request: Request, email: string) {
  return (await casesFor(request, email)).filter((c) => c.estado === "aberto");
}

const options = (page: Page) => page.getByRole("listbox").getByRole("option");
const banner = (page: Page) =>
  page.getByText(/^Sem conexão\. Mostrando os dados de \d{2}:\d{2}\.$/);

async function writePosts(request: Request, email: string) {
  return (await callsFor(request, email)).filter(
    (call) =>
      call.method === "POST" && /\/(decide|request-documents)$/.test(call.path),
  );
}

test.describe("Fila offline (T111) @feature-ops-panel @panel-fila", () => {
  test("AC 44: offline keeps the tree with offline.panel; decisions disabled with offline.actions; another case or tab does nothing; reconnect re-reads once, announces offline.back and polls", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-offline", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await expect(options(page)).toHaveCount(2);
    const heading = page.locator("[data-detail-heading]:visible");
    await expect(heading).toBeVisible();

    await context.setOffline(true);
    await expect(banner(page)).toBeVisible();
    for (const name of ["Aprovar", "Pedir documento", "Bloquear"]) {
      const button = page.getByRole("button", { name, exact: true });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAccessibleDescription(OFFLINE_ACTIONS);
    }
    await expect(page.getByRole("listbox")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await options(page).nth(1).click({ force: true });
    const tab = page.getByRole("link", { name: /^Aguardando vendedor/ });
    await expect(tab).toHaveAttribute("aria-disabled", "true");
    await tab.click({ force: true });
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(heading).toBeVisible();

    // Meanwhile the second case is decided elsewhere.
    await decideElsewhere(request, second?.id ?? "");
    const before = (await callsFor(request, email)).length;
    await context.setOffline(false);
    await expect(
      page.getByRole("status").filter({
        hasText: "Conexão de volta. Dados atualizados.",
      }),
    ).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await expect(options(page)).toHaveCount(1, { timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "Aprovar", exact: true }),
    ).toBeEnabled();
    await expect
      .poll(async () =>
        (await callsFor(request, email))
          .slice(before)
          .some((call) => call.path.includes("desde=")),
      )
      .toBe(true);
  });

  test("F14: a dialog submitted offline fails in place; reconnecting retries nothing", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-offline-f14", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await page.getByRole("button", { name: "Bloquear", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Outro motivo" }).check();
    await context.setOffline(true);
    await dialog.getByRole("button", { name: "Bloquear vendedor" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.",
    );
    await context.setOffline(false);
    await expect(
      page.getByRole("status").filter({ hasText: "Conexão de volta." }),
    ).toBeVisible();
    await page.waitForTimeout(1_500);
    expect(await writePosts(request, email)).toHaveLength(0);
    await expect(dialog).toBeVisible();
  });

  test("no Fila service worker is registered", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-offline-sw", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "um");
    await logIn(page, email);
    await page.goto("/fila");
    expect(
      await page.evaluate(async () =>
        "serviceWorker" in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : 0,
      ),
    ).toBe(0);
  });
});

test.describe("Fila offline at 360 (T111) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("the decisions are disabled with offline.actions visible", async ({
    page,
    context,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-offline-360", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await expect(page.locator("[data-detail-heading]:visible")).toBeVisible();
    await context.setOffline(true);
    await expect(banner(page)).toBeVisible();
    await expect(page.getByText(OFFLINE_ACTIONS)).toBeVisible();
    for (const name of ["Aprovar", "Pedir documento", "Bloquear"])
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeDisabled();
    await context.setOffline(false);
    await expect(banner(page)).toHaveCount(0);
  });
});
