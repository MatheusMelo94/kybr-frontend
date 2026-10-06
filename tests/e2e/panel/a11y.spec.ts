import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../fixtures/axe.ts";
import {
  forEachLoteBatchState,
  forEachLoteUploadState,
  visit,
} from "../fixtures/lote-states.ts";
import {
  createAccount,
  createBatch,
  logIn,
  pendingSignup,
  seed,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T63: the cross-cutting ACs on every M4 screen and state (QA § Accessibility
// Cases): AC 67 (the backend's message never shows), AC 69 (axe, light and
// dark), AC 72 (gender-neutral), AC 74 (320 px and 200 % text, no page
// scroll). At 1280 (panel-desktop) and on the phone projects.

const SENTINEL = "MSG-BACKEND-NAO-EXIBIR";
const GENDERED = /bem-vind|obrigad|você mesm/i;

async function crossCutting(page: Page, label: string): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1 }).first(),
    label,
  ).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text, `${label}: AC 67`).not.toContain(SENTINEL);
  expect(text, `${label}: AC 72`).not.toMatch(GENDERED);
  await expectNoAxeViolations(page);

  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  for (const [width, scale] of [
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
    expect(
      overflow,
      `${label}: AC 74 at ${width}px, ${scale} text`,
    ).toBeLessThanOrEqual(0);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page.setViewportSize(viewport);
}

async function submitAction(page: Page, button: string): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] !== undefined,
    ),
    page.getByRole("button", { name: button }).click(),
  ]);
}

test.describe("M4 cross-cutting: AC 67, 69, 72, 74 @feature-ops-panel @panel-access @panel-phone", () => {
  test.setTimeout(180_000);

  test("the auth screens and their error states", async ({
    page,
  }, testInfo) => {
    await page.goto("/entrar");
    await crossCutting(page, "/entrar");
    await page.getByLabel("E-mail").fill(uniqueEmail("ninguem", testInfo));
    await page.getByLabel("Senha").fill("errada-errada-1");
    await submitAction(page, "Entrar");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "E-mail ou senha incorretos.",
    );
    await crossCutting(page, "/entrar wrong credentials");

    for (const motivo of ["sessao&perdido=1", "saiu", "senha-nova"]) {
      await page.goto(`/entrar?motivo=${motivo}`);
      await crossCutting(page, `/entrar?motivo=${motivo}`);
    }

    await page.goto("/cadastro");
    await crossCutting(page, "/cadastro");
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByLabel("Seu nome")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await crossCutting(page, "/cadastro validation");

    await pendingSignup(page, uniqueEmail("a11y", testInfo));
    await page.goto("/cadastro/confirmar");
    await crossCutting(page, "/cadastro/confirmar");
    await page.getByLabel("Código").fill("000000");
    await submitAction(page, "Confirmar");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "Código incorreto",
    );
    await crossCutting(page, "/cadastro/confirmar wrong code");

    await page.goto("/senha/esqueci");
    await crossCutting(page, "/senha/esqueci");
    await page.goto("/senha/nova");
    await crossCutting(page, "/senha/nova expired");
    await page.goto("/senha/nova#t=TOKEN_sintetico_0123456789abcdef");
    await crossCutting(page, "/senha/nova");
  });

  test("onboarding, the shell with the Fila, not-found and the fatal error", async ({
    page,
    request,
  }, testInfo) => {
    const nova = uniqueEmail("a11y-onb", testInfo);
    await createAccount(request, nova, "nova");
    await logIn(page, nova);
    await expect(page).toHaveURL(/\/comecar$/);
    await crossCutting(page, "/comecar");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Escolha um tipo de vendedor.")).toBeVisible();
    await crossCutting(page, "/comecar validation");

    const failing = uniqueEmail("a11y-cat", testInfo);
    await createAccount(request, failing, "nova");
    await seed(request, "categorias-falham", failing);
    await page.context().clearCookies();
    await logIn(page, failing);
    await expect(
      page.getByRole("heading", { name: "Não carregou" }),
    ).toBeFocused();
    await page.waitForLoadState("networkidle");
    await expectNoAxeViolations(page);

    const renata = uniqueEmail("a11y-shell", testInfo);
    await createAccount(request, renata);
    await page.context().clearCookies();
    await logIn(page, renata);
    await expect(page).toHaveURL(/\/fila$/);
    await crossCutting(page, "/fila (shell)");

    await page.goto("/nao-existe");
    await crossCutting(page, "not-found");

    await seed(request, "me-falha", renata);
    await page.goto("/fila");
    await expect(
      page.getByRole("heading", { name: "Algo deu errado nesta tela" }),
    ).toBeFocused();
    await page.waitForLoadState("networkidle");
    await crossCutting(page, "fatal error");
  });
});

/**
 * Lote's extra cross-cutting checks (T89): AC 68 (the only CNPJ input is the
 * Lote file: no text field in main), AC 71 (every status dot, bar or donut
 * is aria-hidden beside a word), AC 76 (every CNPJ and count in main is
 * tabular).
 */
async function loteCrossCutting(page: Page, label: string): Promise<void> {
  await crossCutting(page, label);
  const fields = await page
    .locator("main")
    .locator(
      "input:not([type=file]):not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea",
    )
    .count();
  expect(fields, `${label}: AC 68`).toBe(0);
  const unlabeled = await page.locator("main").evaluate((main) =>
    [...main.querySelectorAll<SVGElement | HTMLElement>("svg, [data-status-dot]")]
      .filter((mark) => mark.closest("[aria-hidden=true]") === null)
      .map((mark) => mark.outerHTML.slice(0, 60)),
  );
  expect(unlabeled, `${label}: AC 71 (marks are aria-hidden)`).toEqual([]);
  const notTabular = await page.locator("main").evaluate((main) =>
    [...main.querySelectorAll<HTMLElement>("*")]
      // Seen text only: a screen-reader-only live region has no figures to align.
      .filter(
        (element) =>
          element.getClientRects().length > 0 &&
          element.closest(".sr-only") === null,
      )
      .filter((element) =>
        [...element.childNodes].some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\b\d+ CNPJs?\b/.test(
              node.textContent ?? "",
            ),
        ),
      )
      .filter(
        (element) =>
          !getComputedStyle(element).fontVariantNumeric.includes(
            "tabular-nums",
          ),
      )
      .map((element) => element.textContent?.trim().slice(0, 50)),
  );
  expect(notTabular, `${label}: AC 76`).toEqual([]);
}

test.describe("M5 cross-cutting on Lote: AC 67, 68, 69, 71, 72, 73, 74, 76 @feature-ops-panel @panel-lote @panel-phone", () => {
  test.setTimeout(240_000);

  test("every /lote state", async ({ page, request }, testInfo) => {
    await forEachLoteUploadState(page, request, testInfo, (label) =>
      loteCrossCutting(page, label),
    );
  });

  test("every /lote/{id} state", async ({ page, request }, testInfo) => {
    await forEachLoteBatchState(page, request, testInfo, (label) =>
      loteCrossCutting(page, label),
    );
  });

  test("AC 73: another workspace's batch renders the not-found state, identical to an unknown id", async ({
    page,
    request,
  }, testInfo) => {
    const owner = uniqueEmail("a11y-lote-dono", testInfo);
    const other = uniqueEmail("a11y-lote-outro", testInfo);
    await createAccount(request, owner, "pago");
    await createAccount(request, other, "pago");
    const foreign = await createBatch(request, owner, "ac16", { finish: true });
    await logIn(page, other);

    await visit(page, `/lote/${foreign}`);
    const foreignText = await page.locator("main").innerText();
    await visit(page, "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b");
    const unknownText = await page.locator("main").innerText();
    expect(foreignText).toBe(unknownText);
    for (const file of ["resultado.csv", "erros.csv"])
      expect(
        (await page.request.get(`/lote/${foreign}/${file}`)).status(),
      ).toBe(404);
  });
});

