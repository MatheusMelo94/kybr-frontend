import { expect, test, type Page } from "@playwright/test";

import {
  caseSeed,
  casesFor,
  decideElsewhere,
  seedCases,
  setWorkspace,
} from "../fixtures/fila-mock.ts";
import {
  callsFor,
  createAccount,
  expireSessions,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T107: Bloquear (AC 38; D10; Q8/Q9; Security F5, F6, F7). Non-optimistic:
// nothing leaves the list before ok. The heading is [data-detail-heading]:visible.

type Request = Parameters<typeof casesFor>[0];

const NETWORK_ERROR =
  "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.";

async function openCases(request: Request, email: string) {
  return (await casesFor(request, email)).filter((c) => c.estado === "aberto");
}

async function decidePosts(request: Request, email: string) {
  return (await callsFor(request, email)).filter(
    (call) => call.method === "POST" && /\/decide$/.test(call.path),
  );
}

function blockDialog(page: Page) {
  return page.getByRole("dialog");
}

async function openBlock(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(blockDialog(page)).toBeVisible();
}

test.describe("Fila decisions: Bloquear (T107) @feature-ops-panel @panel-fila", () => {
  test("the lead follows webhook_configurado; no reason → block.error.reason with focus on the group", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-bloq-lead", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await setWorkspace(request, email, { webhook_configurado: false });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await openBlock(page);
    const dialog = blockDialog(page);
    await expect(
      dialog.getByText(
        "O vendedor vê o motivo no link. Bloqueie também o vendedor na sua plataforma.",
      ),
    ).toBeVisible();
    await expect(dialog.getByRole("radio").first()).toBeFocused();
    await dialog.getByRole("button", { name: "Bloquear vendedor" }).click();
    const group = dialog.getByRole("radiogroup", { name: "Motivo" });
    await expect(group).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText("Escolha um motivo.")).toBeVisible();
    await expect(dialog.getByRole("radio").first()).toBeFocused();
    expect(await decidePosts(request, email)).toHaveLength(0);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Bloquear", exact: true }),
    ).toBeFocused();

    await setWorkspace(request, email, { webhook_configurado: true });
    await page.reload();
    await openBlock(page);
    await expect(
      dialog.getByText(
        "O vendedor vê o motivo no link, e avisamos seu sistema pelo webhook.",
      ),
    ).toBeVisible();
    // Q9: the draft didn't survive the Esc.
    await expect(dialog.getByRole("radio", { checked: true })).toHaveCount(0);
  });

  test("F6: busy, still in the list and on /fila/{id}, Esc ignored; on ok the dialog closes, toast.blocked, /fila/{next} with focus, counts drop", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-bloq", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await caseSeed(request, email, "decide-lento", { ms: 1_500, n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    const tab = page.getByRole("link", { name: /^Para decidir/ });
    await expect(tab).toHaveText(/\(2\)$/);
    await openBlock(page);
    const dialog = blockDialog(page);
    await dialog.getByRole("radio", { name: "Outro motivo" }).check();
    const note = dialog.getByRole("textbox", {
      name: "Mensagem para o vendedor (opcional)",
    });
    await note.fill("x".repeat(281));
    await expect(note).toHaveValue("x".repeat(280));
    await note.fill("Procure o suporte.");
    await dialog.getByRole("button", { name: "Bloquear vendedor" }).click();

    await expect(
      dialog.getByRole("button", { name: "Bloqueando…" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));

    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("status").filter({
        hasText: `Bloqueado: ${first?.razao_social}`,
      }),
    ).toContainText("Registrado na trilha de auditoria.");
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
    await expect(tab).toHaveText(/\(1\)$/);
    const [post] = await decidePosts(request, email);
    expect(post?.pagePath).toBe(`/fila/${first?.id}`);
  });

  test("a failure (503): error.network in the dialog, the values kept, the case in place; the retry succeeds", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-bloq-falha", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await caseSeed(request, email, "decide-falha", { n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await openBlock(page);
    const dialog = blockDialog(page);
    await dialog.getByRole("radio", { name: "MEI acima do limite" }).check();
    const note = dialog.getByRole("textbox", {
      name: "Mensagem para o vendedor (opcional)",
    });
    await note.fill("Nota.");
    await dialog.getByRole("button", { name: "Bloquear vendedor" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(NETWORK_ERROR);
    await expect(
      dialog.getByRole("radio", { name: "MEI acima do limite" }),
    ).toBeChecked();
    await expect(note).toHaveValue("Nota.");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
    await dialog.getByRole("button", { name: "Bloquear vendedor" }).click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
  });

  test("409 (decided elsewhere): the dialog closes on the decided state with fila.decide.conflict; no toast, no navigation", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-bloq-409", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await openBlock(page);
    await decideElsewhere(request, first?.id ?? "");
    const dialog = blockDialog(page);
    await dialog.getByRole("radio", { name: "Outro motivo" }).check();
    await dialog.getByRole("button", { name: "Bloquear vendedor" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText(/^Este caso já tinha sido decidido em /),
    ).toBeVisible();
    await expect(page.getByText(/^Decidido: Aprovado em /)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(
      page.getByRole("status").filter({ hasText: "Bloqueado:" }),
    ).toHaveCount(0);
  });

  // ADR-0011 Addendum 2: decideAction returns SESSAO_EXPIRADA, the client
  // expiry adds perdido=1 (a boolean only; the draft never reaches the URL).
  test("AC 7: a typed note is a dirty draft: an expiry on submit brings perdido=1", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-bloq-perdido", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await openBlock(page);
    const dialog = blockDialog(page);
    await dialog.getByRole("radio", { name: "Outro motivo" }).check();
    await dialog
      .getByRole("textbox", { name: "Mensagem para o vendedor (opcional)" })
      .fill("rascunho");
    await expireSessions(request, email);
    await dialog.getByRole("button", { name: "Bloquear vendedor" }).click();
    await expect(page).toHaveURL(/\/entrar\?.*perdido=1/);
    expect(new URL(page.url()).searchParams.get("volta")).toBe(
      `/fila/${first?.id}`,
    );
    expect(page.url()).not.toContain("rascunho");
    await expect(
      page.getByText("O que estava aberto num formulário não foi salvo."),
    ).toBeVisible();
  });
});

test.describe("Fila decisions: Bloquear the last case (T107, F7) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("blocking the last case of Para decidir succeeds from /fila/{id} and shows the empty state", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-bloq-ultimo", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "um");
    const [only] = await openCases(request, email);
    const statuses: number[] = [];
    page.on("response", (response) => {
      if (response.request().method() === "POST")
        statuses.push(response.status());
    });
    await logIn(page, email);
    await page.goto(`/fila/${only?.id}`);
    await openBlock(page);
    const dialog = blockDialog(page);
    await dialog.getByRole("radio", { name: "Outro motivo" }).check();
    await dialog.getByRole("button", { name: "Bloquear vendedor" }).click();
    await expect(page).toHaveURL(/\/fila$/);
    await expect(
      page.getByRole("heading", { name: "Nenhum caso aberto" }),
    ).toBeVisible();
    const [post] = await decidePosts(request, email);
    expect(post?.pagePath).toBe(`/fila/${only?.id}`);
    expect(statuses).not.toContain(404);
  });
});
