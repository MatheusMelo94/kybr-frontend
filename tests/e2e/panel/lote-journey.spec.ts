import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  chooserByKeyboard,
  dropZoneHydrated,
  pickLoteFile,
  visit,
} from "../fixtures/lote-states.ts";
import {
  createAccount,
  logIn,
  outbox,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T89: the M5 journey, keyboard only at 1280 (AC 25, criterion 3 against
// MSW; spec J1 → J3): sign up, the code, onboarding, Lote's step 2, the AC 16
// file, the preview, the start, progress and the result. No dead end, no
// external link. The interaction time (everything but the wait for the
// batch) goes in the report for QA, who times AC 25 (≤ 5 min).

const TURNSTILE_PASS = "XXXX.DUMMY.TOKEN.XXXX";
const FILES = "tests/fixtures/files/lote";

/** Presses Tab until `target` has focus (never clicks, never calls focus()). */
async function tabTo(page: Page, target: Locator, max = 60): Promise<void> {
  for (let presses = 0; presses < max; presses++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    await page.keyboard.press("Tab");
  }
  throw new Error("tabTo: the target was never reached by Tab");
}

async function typeInto(page: Page, field: Locator, text: string) {
  await tabTo(page, field);
  await page.keyboard.type(text);
}

async function pressOn(page: Page, target: Locator, key = "Enter") {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

/** The keyboard way to a file: Tab to "Escolher arquivo", open the chooser, pick. */
async function pickByKeyboard(page: Page, name: string): Promise<void> {
  await dropZoneHydrated(page);
  await tabTo(page, page.getByRole("button", { name: "Escolher arquivo" }));
  const chooser = await chooserByKeyboard(page);
  await chooser.setFiles(`${FILES}/${name}`);
}

async function expectAc16Preview(page: Page): Promise<void> {
  const preview = page.getByRole("region", {
    name: "Confira antes de verificar",
  });
  await expect(
    preview.getByRole("heading", { name: "Confira antes de verificar" }),
  ).toBeFocused();
  await expect(
    preview.getByText('Encontramos 184 CNPJs na coluna "CNPJ".'),
  ).toBeVisible();
  await expect(
    preview.getByText("4 CNPJs repetidos: verificamos uma vez só."),
  ).toBeVisible();
  await expect(
    preview.getByText("2 CNPJs inválidos: não serão consultados."),
  ).toBeVisible();
}

test.describe("M5 journey, keyboard only @feature-ops-panel @panel-lote", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.setTimeout(180_000);

  test("AC 25: /cadastro → code → /comecar → /lote?inicio=1 → the AC 16 CSV → preview → Verificar 184 CNPJs → progress → the result", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("jornada-lote", testInfo);
    const started = Date.now();
    const external: string[] = [];
    // "No external link needed": every page of the journey is ours.
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      const host = new URL(frame.url()).hostname;
      if (host !== "127.0.0.1") external.push(frame.url());
    });

    // S1
    await page.goto("/cadastro");
    await typeInto(page, page.getByLabel("Seu nome"), "Pessoa Exemplo");
    await typeInto(page, page.getByLabel("Nome da plataforma"), "Plataforma Exemplo");
    await typeInto(page, page.getByLabel("E-mail de trabalho"), email);
    await typeInto(page, page.getByLabel("Senha"), "uma-senha-segura-1");
    await pressOn(page, page.getByRole("checkbox"), "Space");
    await expect(page.locator('input[name="turnstile"]')).toHaveValue(
      TURNSTILE_PASS,
      { timeout: 20_000 },
    );
    await pressOn(page, page.getByRole("button", { name: "Criar conta" }));

    // S2: the code from the outbox
    await expect(page).toHaveURL(/\/cadastro\/confirmar$/);
    const { codigo = "" } = await outbox(request, email);
    await typeInto(page, page.getByLabel("Código"), codigo);
    await page.keyboard.press("Enter");

    // S4: onboarding step 1
    await expect(page).toHaveURL(/\/comecar$/);
    await typeInto(page, page.getByLabel("E-mail para vendedores"), "suporte@exemplo.test");
    await pressOn(page, page.getByRole("radio", { name: "Lojas de peças" }), "Space");
    await pressOn(page, page.getByRole("button", { name: "Continuar" }));

    // Step 2: Lote
    await expect(page).toHaveURL(/\/lote\?inicio=1$/);
    await expect(page.getByText("Passo 2 de 2")).toBeVisible();
    await pickByKeyboard(page, "ac16.csv");
    await expectAc16Preview(page);

    // The start, then the batch runs (the mock moves it on each read).
    await pressOn(page, page.getByRole("button", { name: "Verificar 184 CNPJs" }));
    const waitFrom = Date.now();
    await expect(page).toHaveURL(/\/lote\/[A-Za-z0-9_-]{22,64}$/);
    await expect(page.getByRole("progressbar")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Resultado" })).toBeFocused({
      timeout: 60_000,
    });
    const waited = Date.now() - waitFrom;
    await expect(
      page.getByText(/^181 CNPJs consultados em /, { exact: false }).first(),
    ).toBeVisible();

    const interaction = Date.now() - started - waited;
    testInfo.annotations.push({
      type: "AC 25 interaction time",
      description: `${(interaction / 1000).toFixed(1)} s of interaction (batch wait ${(waited / 1000).toFixed(1)} s excluded); QA times the human run`,
    });
    console.log(
      `AC 25: ${(interaction / 1000).toFixed(1)} s of scripted interaction, ${(waited / 1000).toFixed(1)} s of batch processing excluded`,
    );
    expect(external, "no page off the panel host on the way").toEqual([]);
  });

  for (const name of ["ac16.xlsx", "ac16.xls"])
    test(`the same step with ${name} reaches the same preview (184 / 4 / 2) from the keyboard`, async ({
      page,
      request,
    }, testInfo) => {
      const email = uniqueEmail("jornada-lote-xlsx", testInfo);
      await createAccount(request, email, "pago");
      await logIn(page, email);
      await visit(page, "/lote?inicio=1");
      await pickByKeyboard(page, name);
      await expectAc16Preview(page);
      await expect(
        page.getByRole("button", { name: "Verificar 184 CNPJs" }),
      ).not.toHaveAttribute("aria-disabled", "true");
    });
});

// QA's panel-firefox smoke for Lote (the handoff's projects row): the worker
// parses in Gecko too, and a batch starts and ends.
test.describe("Lote smoke @feature-ops-panel @panel-lote @panel-smoke", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("preview → start → result", async ({ page, request }, testInfo) => {
    const email = uniqueEmail("lote-fumaca", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    await visit(page, "/lote");
    await pickLoteFile(page, "ac16.xlsx");
    await expectAc16Preview(page);
    await page.getByRole("button", { name: "Verificar 184 CNPJs" }).click();
    await expect(page.getByRole("heading", { name: "Resultado" })).toBeVisible({
      timeout: 60_000,
    });
  });
});

