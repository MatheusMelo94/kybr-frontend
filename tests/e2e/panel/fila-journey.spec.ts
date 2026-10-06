import { expect, test, type Page } from "@playwright/test";

import { casesFor, seedCases, type MockCase } from "../fixtures/fila-mock.ts";
import { MOCK_API } from "../fixtures/mock-api.ts";
import { createAccount, uniqueEmail } from "../fixtures/panel-mock.ts";

// T117: the decide-the-queue journey (criterion 2's Fila half, Pre-Contract
// against MSW). At 1280 with the keyboard only (no pointer: every control
// is focused and pressed), and the e-mail deep link at 360 (@panel-phone).

const CONTROLS = `${MOCK_API}/__mock/panel`;

const byKind = (cases: MockCase[], kind: string): MockCase => {
  const found = cases.find((c) => c.kind === kind);
  if (!found) throw new Error(`no ${kind} case`);
  return found;
};

const heading = (page: Page) => page.locator("[data-detail-heading]:visible");
const dialog = (page: Page) => page.locator("dialog[open]");
const toast = (page: Page, text: RegExp | string) =>
  page.getByRole("status").filter({ hasText: text });

/** Focus, then press: the keyboard's way to use a control. */
async function press(
  page: Page,
  name: string | RegExp,
  key = "Enter",
  role: "button" | "checkbox" | "radio" = "button",
): Promise<void> {
  // With a modal open, only its controls.
  const scope = (await dialog(page).isVisible()) ? dialog(page) : page;
  const control = scope.getByRole(role, {
    name,
    ...(typeof name === "string" && { exact: true }),
  });
  await control.focus();
  await page.keyboard.press(key);
}

/** Opens a case from the list with the keyboard (arrows + Enter). */
async function openFromList(page: Page, id: string): Promise<void> {
  const listbox = page.getByRole("listbox");
  await listbox.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < 30; i += 1) {
    const active = await listbox.getAttribute("aria-activedescendant");
    if (active?.endsWith(id)) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/fila/${id}$`));
  await expect(heading(page)).toBeVisible();
}

async function keyboardLogIn(page: Page, email: string, path: string) {
  await page.goto(path);
  await page.getByLabel("E-mail").focus();
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await page.keyboard.type("senha-correta-123");
  await page.keyboard.press("Enter");
}

test.describe("the M6 journey at 1280, keyboard only (T117) @feature-ops-panel @panel-fila", () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    "the two-pane journey",
  );

  test("log in → /fila → Aprovar → Pedir documento with the link copied → Bloquear with a reason and a note → Manter aprovado → an upload, the notice, Mostrar, decide it → Baixar comprovante; no dead end, the count reaches 2", async ({
    page,
    context,
    request,
    browserName,
  }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(browserName !== "chromium", "clipboard permissions: chromium");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const email = uniqueEmail("fila-jornada", testInfo);
    await createAccount(request, email);
    const cases = await seedCases(request, email, "cada-tipo");
    const tab = page.getByRole("link", { name: /^Para decidir/ });

    await keyboardLogIn(page, email, "/entrar");
    // Auto-select at lg: the oldest case opens.
    const link = byKind(cases, "link");
    await expect(page).toHaveURL(new RegExp(`/fila/${link.id}$`));
    await expect(tab).toHaveText("Para decidir (6)");

    // Aprovar: the next case opens.
    await expect(page.getByRole("listbox")).toBeVisible();
    await press(page, "Aprovar");
    await expect(toast(page, /^Aprovado: /)).toBeVisible();
    const semEmail = byKind(cases, "link-sem-email");
    await expect(page).toHaveURL(new RegExp(`/fila/${semEmail.id}$`));

    // Pedir documento on a no-e-mail case → the link panel → Copiar link.
    await press(page, "Pedir documento");
    await expect(dialog(page)).toBeVisible();
    await press(page, "Cartão CNPJ atualizado", "Space", "checkbox");
    await press(page, /^Pedir documento$/);
    await expect(dialog(page)).toBeHidden();
    await expect(
      page.getByRole("heading", {
        name: "Pedido criado. Envie este link ao vendedor:",
      }),
    ).toBeFocused();
    await press(page, "Copiar link");
    await expect(toast(page, "Link copiado")).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      /\/v\/[^/]+\/c\//,
    );

    // Bloquear with a reason and a note.
    const lote = byKind(cases, "lote");
    await openFromList(page, lote.id);
    await press(page, "Bloquear");
    await expect(dialog(page)).toBeVisible();
    await press(page, "Outro motivo", "Space", "radio");
    await dialog(page)
      .getByLabel("Mensagem para o vendedor (opcional)")
      .focus();
    await page.keyboard.type("Fale com o suporte.");
    await press(page, "Bloquear vendedor");
    await expect(toast(page, /^Bloqueado: /)).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`/fila/${lote.id}$`));

    // Manter aprovado on an alert case.
    const alerta = byKind(cases, "alerta");
    await openFromList(page, alerta.id);
    await press(page, "Manter aprovado");
    await expect(toast(page, /^Mantido como aprovado: /)).toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`/fila/${alerta.id}$`));

    // A seller uploads on a waiting case → the notice → Mostrar → decide it.
    const waiting = byKind(cases, "aguardando");
    const upload = await request.post(
      `${CONTROLS}/cases/${waiting.id}/upload`,
      {
        data: { tipo: "CARTAO_CNPJ" },
      },
    );
    expect(upload.status()).toBe(204);
    await page.evaluate(() =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await expect(
      page.getByRole("status").filter({ hasText: /casos? novos?/ }),
    ).toHaveText(/1 caso novo/, { timeout: 15_000 });
    await press(page, "Mostrar");
    await expect(
      page.getByRole("listbox").locator(`[data-id="${waiting.id}"]`),
    ).toBeVisible({ timeout: 15_000 });
    await openFromList(page, waiting.id);
    await press(page, /^(Aprovar|Manter aprovado)$/);
    await expect(page).not.toHaveURL(new RegExp(`/fila/${waiting.id}$`));

    // Two left: lote without QSA and nodata.
    await expect(tab).toHaveText("Para decidir (2)", { timeout: 15_000 });

    // Baixar comprovante on a decided case.
    await page.goto(`/fila/${link.id}`);
    await expect(heading(page)).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      press(page, "Baixar comprovante"),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^kybr-comprovante-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
});

test.describe("the M6 journey at 360 (T117) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("the e-mail deep link /fila/{id} through /entrar?volta= → the detail → Bloquear via the sheet → the next case → the empty list", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) >= 1024,
      "phone and tablet widths only",
    );
    const email = uniqueEmail("fila-jornada-360", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = (await casesFor(request, email)).filter(
      (c) => c.estado === "aberto",
    );

    await page.goto(`/fila/${first?.id}`);
    await expect(page).toHaveURL(
      new RegExp(`/entrar\\?volta=%2Ffila%2F${first?.id}$`),
    );
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("senha-correta-123");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(heading(page)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Voltar para a fila" }),
    ).toBeVisible();

    const block = page.getByRole("button", { name: "Bloquear", exact: true });
    await block.focus();
    await block.click();
    const sheet = dialog(page);
    await expect(sheet).toBeVisible();
    await sheet.getByRole("radio", { name: "Outro motivo" }).check();
    await sheet.getByRole("button", { name: "Bloquear vendedor" }).click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));

    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(page).toHaveURL(/\/fila$/);
    await expect(
      page.getByRole("heading", { name: "Nenhum caso aberto" }),
    ).toBeVisible();
  });
});
