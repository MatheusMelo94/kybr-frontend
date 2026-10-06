import { join } from "node:path";

import {
  expect,
  type APIRequestContext,
  type FileChooser,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  createAccount,
  createBatch,
  logIn,
  seed,
  setPlan,
  uniqueEmail,
} from "./panel-mock.ts";

// Every Lote screen and state of the M5 routes-and-states table, driven one
// after the other on one page, with a check run on each (T87's axe and
// reflow, T89's cross-cutting ACs). The PDF and corrupt files stand for the
// file errors; the mock's presets for the plan states.

const FILES = join(process.cwd(), "tests/fixtures/files/lote");

/**
 * Resolves once React has hydrated the drop zone's button (its props are on
 * the node): before that, a press opens nothing. networkidle alone isn't
 * enough when the machine is busy (parallel workers).
 */
export async function dropZoneHydrated(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Escolher arquivo" });
  await expect(button).toBeVisible();
  await expect
    .poll(() =>
      button.evaluate((node) =>
        Object.keys(node).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true);
}

/**
 * Opens the file chooser from the focused "Escolher arquivo" with the
 * keyboard: Enter, then Space. Under parallel load, headless Chromium now
 * and then shows no chooser for a key press on a hydrated, focused button
 * (seen 1 in ~10 runs); each key gets 5 s, two rounds.
 */
export async function chooserByKeyboard(page: Page): Promise<FileChooser> {
  for (let round = 0; round < 2; round++)
    for (const key of ["Enter", "Space"]) {
      const chooser = page.waitForEvent("filechooser", { timeout: 5_000 });
      await page.keyboard.press(key);
      const opened = await chooser.catch(() => null);
      if (opened !== null) return opened;
    }
  throw new Error("no file chooser from the keyboard");
}

export async function pickLoteFile(page: Page, name: string): Promise<void> {
  await dropZoneHydrated(page);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Escolher arquivo" }).click(),
  ]);
  await chooser.setFiles(join(FILES, name));
}

/** A navigation, then the network quiet: a click before hydration is lost. */
export async function visit(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export type LoteStateCheck = (label: string) => Promise<void>;

const UNKNOWN_BATCH = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

/** The /lote states: empty, inicio=1, file error, preview, no column, over the allowance, used up. */
export async function forEachLoteUploadState(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
  check: LoteStateCheck,
): Promise<void> {
  const email = uniqueEmail("lote-estados", testInfo);
  await createAccount(request, email, "pago");
  await logIn(page, email);
  const main = page.locator("main");

  await visit(page, "/lote");
  await expect(main.getByRole("button", { name: "Escolher arquivo" })).toBeVisible();
  await check("/lote empty");

  await visit(page, "/lote?inicio=1");
  await expect(main.getByText("Passo 2 de 2")).toBeVisible();
  await check("/lote?inicio=1");

  await visit(page, "/lote");
  await pickLoteFile(page, "documento.pdf");
  await expect(
    main.getByText("Este arquivo não é CSV nem Excel. Escolha outro.").first(),
  ).toBeVisible();
  await check("/lote file error");

  await pickLoteFile(page, "ac16.csv");
  await expect(
    main.getByText('Encontramos 184 CNPJs na coluna "CNPJ".').first(),
  ).toBeVisible();
  await check("/lote preview");

  await visit(page, "/lote");
  await pickLoteFile(page, "sem-coluna-cnpj.csv");
  await expect(
    main.getByRole("combobox", { name: "Coluna do CNPJ" }),
  ).toHaveAccessibleDescription("Não achamos a coluna de CNPJ. Escolha qual é.");
  await check("/lote no column");

  await setPlan(request, email, { usadas: 4900 });
  await visit(page, "/lote");
  await pickLoteFile(page, "ac16.csv");
  await expect(
    main.getByText(/A lista tem 184 CNPJs e você tem 100 verificações/),
  ).toBeVisible();
  await check("/lote over the allowance");

  await setPlan(request, email, { usadas: 5000 });
  await visit(page, "/lote");
  await expect(
    main
      .getByText(
        "As verificações do plano acabaram. Contrate para continuar verificando.",
      )
      .first(),
  ).toBeVisible();
  await check("/lote used up");
}

/** The /lote/{id} states: processing, stale, success, partial, failed, not found. */
export async function forEachLoteBatchState(
  page: Page,
  request: APIRequestContext,
  testInfo: TestInfo,
  check: LoteStateCheck,
): Promise<void> {
  const email = uniqueEmail("lote-estados-id", testInfo);
  await createAccount(request, email, "pago");
  const running = await createBatch(request, email, "ac16", { hold: true });
  const success = await createBatch(request, email, "tudo-ok", {
    finish: true,
  });
  const partial = await createBatch(request, email, "ac16", { finish: true });
  const failed = await createBatch(request, email, "falha", { finish: true });
  await logIn(page, email);
  const main = page.locator("main");

  for (const [id, label] of [
    [success, "success"],
    [partial, "partial"],
  ] as const) {
    await visit(page, `/lote/${id}`);
    await expect(main.getByRole("heading", { name: "Resultado" })).toBeVisible();
    await check(`/lote/{id} ${label}`);
  }

  await visit(page, `/lote/${failed}`);
  await expect(
    main.getByRole("heading", { name: "A verificação parou no meio" }),
  ).toBeVisible();
  await check("/lote/{id} failed");

  await visit(page, `/lote/${UNKNOWN_BATCH}`);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await check("/lote/{id} not found");

  // Last: the stale seed makes every later status read fail.
  await visit(page, `/lote/${running}`);
  await expect(main.getByRole("progressbar")).toBeVisible();
  await check("/lote/{id} processing");

  await seed(request, "lote-poll-falha", email, { n: 1_000 });
  await expect(
    main.getByText("Reconectando… Os números voltam a atualizar sozinhos."),
  ).toBeVisible();
  await check("/lote/{id} stale");
}
