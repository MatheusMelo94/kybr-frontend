import { expect, test, type Page } from "@playwright/test";

import {
  caseFault,
  caseSeed,
  casesFor,
  decideElsewhere,
  seedCases,
} from "../fixtures/fila-mock.ts";
import {
  callsFor,
  createAccount,
  expireSessions,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T108: Pedir documento (AC 36, AC 37 before half; D10, D11; Security F5,
// F6, F7). Non-optimistic: nothing leaves the list before ok. With a seller
// e-mail the screen advances; without one it stays (T109's panel).

type Request = Parameters<typeof casesFor>[0];

const NETWORK_ERROR =
  "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.";

async function openCases(request: Request, email: string) {
  return (await casesFor(request, email)).filter((c) => c.estado === "aberto");
}

async function requestPosts(request: Request, email: string) {
  return (await callsFor(request, email)).filter(
    (call) => call.method === "POST" && /\/request-documents$/.test(call.path),
  );
}

function requestDialog(page: Page) {
  return page.getByRole("dialog");
}

async function openRequest(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "Pedir documento", exact: true })
    .click();
  await expect(requestDialog(page)).toBeVisible();
}

function submitButton(page: Page) {
  return requestDialog(page).getByRole("button", {
    name: /^(Pedir documento|Pedir \d documentos)$/,
  });
}

test.describe("Fila decisions: Pedir documento (T108) @feature-ops-panel @panel-fila", () => {
  test("AC 36: doc.lead and G10's four types; none → doc.error.none; two → Pedir 2 documentos; on ok the case moves to Aguardando vendedor and the screen advances", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-pedir", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await caseFault(request, email, "request-documents", "delay", {
      ms: 1_500,
      times: 1,
    });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    const open = page.getByRole("link", { name: /^Para decidir/ });
    const waiting = page.getByRole("link", { name: /^Aguardando vendedor/ });
    await expect(open).toHaveText(/\(2\)$/);
    await expect(waiting).toHaveText(/\(0\)$/);

    await openRequest(page);
    const dialog = requestDialog(page);
    await expect(
      dialog.getByText("O vendedor recebe um e-mail com o link para enviar."),
    ).toBeVisible();
    const group = dialog.getByRole("group", { name: "Quais documentos?" });
    await expect(group.getByRole("checkbox")).toHaveCount(4);
    await expect(group.getByRole("checkbox").first()).toBeFocused();
    await submitButton(page).click();
    await expect(group).toHaveAttribute("aria-invalid", "true");
    await expect(
      dialog.getByText("Escolha pelo menos um documento."),
    ).toBeVisible();
    await expect(group.getByRole("checkbox").first()).toBeFocused();
    expect(await requestPosts(request, email)).toHaveLength(0);

    await dialog
      .getByRole("checkbox", { name: "Cartão CNPJ atualizado" })
      .check();
    await expect(submitButton(page)).toHaveAccessibleName("Pedir documento");
    await dialog
      .getByRole("checkbox", { name: "Contrato social ou CCMEI" })
      .check();
    await expect(submitButton(page)).toHaveAccessibleName("Pedir 2 documentos");
    await submitButton(page).click();

    await expect(
      dialog.getByRole("button", { name: "Pedindo…" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));

    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("status").filter({
        hasText: `Documento pedido: ${first?.razao_social}`,
      }),
    ).toContainText("Registrado na trilha de auditoria.");
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
    await expect(page.locator("[data-detail-heading]:visible")).toBeFocused();
    await expect(open).toHaveText(/\(1\)$/);
    await expect(waiting).toHaveText(/\(1\)$/);
    const [post] = await requestPosts(request, email);
    expect(post?.tipos).toEqual(["CONTRATO_SOCIAL_OU_CCMEI", "CARTAO_CNPJ"]);
    expect(post?.pagePath).toBe(`/fila/${first?.id}`);
  });

  test("AC 37 (before): without a seller e-mail, doc.noemail.lead; on ok the dialog closes and the screen stays on the case (D11)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-pedir-semmail", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "cada-tipo");
    const target = (await openCases(request, email)).find(
      (c) => c.kind === "link-sem-email",
    );
    await logIn(page, email);
    await page.goto(`/fila/${target?.id}`);
    await openRequest(page);
    const dialog = requestDialog(page);
    await expect(
      dialog.getByText(
        "Este vendedor não deixou e-mail. Depois de pedir, copie o link e envie pelo canal que você usa com ele.",
      ),
    ).toBeVisible();
    await dialog
      .getByRole("checkbox", { name: "Cartão CNPJ atualizado" })
      .check();
    await submitButton(page).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("status").filter({ hasText: "Documento pedido:" }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/fila/${target?.id}$`));
    expect(await requestPosts(request, email)).toHaveLength(1);
  });

  test("a failure (503): error.network in the dialog, the values kept, the case in place; the retry succeeds", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-pedir-falha", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await caseSeed(request, email, "pedido-falha", { n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await openRequest(page);
    const dialog = requestDialog(page);
    await dialog
      .getByRole("checkbox", { name: "Cartão CNPJ atualizado" })
      .check();
    const note = dialog.getByRole("textbox", {
      name: "Mensagem para o vendedor (opcional)",
    });
    await note.fill("Nota.");
    await submitButton(page).click();
    await expect(dialog.getByRole("alert")).toHaveText(NETWORK_ERROR);
    await expect(
      dialog.getByRole("checkbox", { name: "Cartão CNPJ atualizado" }),
    ).toBeChecked();
    await expect(note).toHaveValue("Nota.");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
    await submitButton(page).click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
    const keys = (await requestPosts(request, email)).map(
      (call) => call.idempotencyKey,
    );
    // UNAVAILABLE is definitive: the retry is a new intent.
    expect(new Set(keys).size).toBe(2);
  });

  test("F5: a dropped answer (decide-rede) → error.network; the retry carries the same key and gets the first result: one request, one link", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-pedir-rede", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "cada-tipo");
    const target = (await openCases(request, email)).find(
      (c) => c.kind === "link-sem-email",
    );
    await caseSeed(request, email, "decide-rede", { n: 1 });
    await logIn(page, email);
    await page.goto(`/fila/${target?.id}`);
    await openRequest(page);
    const dialog = requestDialog(page);
    await dialog
      .getByRole("checkbox", { name: "Cartão CNPJ atualizado" })
      .check();
    await submitButton(page).click();
    await expect(dialog.getByRole("alert")).toHaveText(NETWORK_ERROR);
    await submitButton(page).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/fila/${target?.id}$`));
    const posts = await requestPosts(request, email);
    expect(posts).toHaveLength(2);
    expect(new Set(posts.map((call) => call.idempotencyKey)).size).toBe(1);
    const after = (await casesFor(request, email)).find(
      (c) => c.id === target?.id,
    );
    expect(after?.estado).toBe("aguardando_doc");
  });

  test("409 (decided elsewhere): the dialog closes on the decided state with fila.decide.conflict; no toast, no navigation", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-pedir-409", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await openRequest(page);
    await decideElsewhere(request, first?.id ?? "");
    const dialog = requestDialog(page);
    await dialog
      .getByRole("checkbox", { name: "Cartão CNPJ atualizado" })
      .check();
    await submitButton(page).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText(/^Este caso já tinha sido decidido em /),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(
      page.getByRole("status").filter({ hasText: "Documento pedido:" }),
    ).toHaveCount(0);
  });

  // ADR-0011 Addendum 2: requestDocumentsAction returns SESSAO_EXPIRADA; a
  // checked type is a dirty draft, and the draft never reaches the URL.
  test("AC 7: checked types are a dirty draft: an expiry on submit brings perdido=1, with no note or types in the URL", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-pedir-perdido", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await openRequest(page);
    const dialog = requestDialog(page);
    await dialog
      .getByRole("checkbox", { name: "Cartão CNPJ atualizado" })
      .check();
    await dialog
      .getByRole("textbox", { name: "Mensagem para o vendedor (opcional)" })
      .fill("rascunho");
    await expireSessions(request, email);
    await submitButton(page).click();
    await expect(page).toHaveURL(/\/entrar\?.*perdido=1/);
    expect(new URL(page.url()).searchParams.get("volta")).toBe(
      `/fila/${first?.id}`,
    );
    expect(page.url()).not.toContain("rascunho");
    expect(page.url()).not.toContain("CARTAO");
    expect(await requestPosts(request, email)).toHaveLength(0);
  });
});

test.describe("Fila decisions: Pedir documento on the last case (T108, F7) @feature-ops-panel @panel-fila @panel-phone", () => {
  test("with an e-mail, the last case of Para decidir succeeds from /fila/{id} and shows the empty state", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-pedir-ultimo", testInfo);
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
    await openRequest(page);
    const dialog = requestDialog(page);
    await dialog
      .getByRole("checkbox", { name: "Cartão CNPJ atualizado" })
      .check();
    await submitButton(page).click();
    await expect(page).toHaveURL(/\/fila$/);
    await expect(
      page.getByRole("heading", { name: "Nenhum caso aberto" }),
    ).toBeVisible();
    const [post] = await requestPosts(request, email);
    expect(post?.pagePath).toBe(`/fila/${only?.id}`);
    expect(statuses).not.toContain(404);
  });
});
