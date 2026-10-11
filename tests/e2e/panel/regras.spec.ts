import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { SETTLE, holdNextAction } from "../fixtures/fila-timing.ts";
import {
  createAccount,
  expireSessions,
  horizontalOverflow,
  logIn,
  seed,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";
import { bumpPolicy, sellersFault } from "../fixtures/sellers-mock.ts";

// T144: Regras (S11, AC 59 first half, plan-m8 D8): the rules with their
// selects, the days, the document switches, the save bar only while dirty,
// Descartar, the nodocs validation, the Switch by keyboard, the load error.

const NODOCS = 'Ative pelo menos um documento para usar "Pedir documento".';

const content = (page: Page) => page.locator("#conteudo");
const saveBar = (page: Page) =>
  content(page).getByRole("region", { name: "Salvar regras" });

async function openRegras(page: Page, email: string): Promise<void> {
  await logIn(page, email);
  await page
    .getByRole("navigation", { name: "Navegação do painel" })
    .getByRole("link", { name: "Regras" })
    .click();
  await page.waitForURL(/\/regras$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Regras de aprovação" }),
  ).toBeVisible();
}

test.describe("Regras @feature-ops-panel @panel-operacao @panel-regras @panel-phone", () => {
  test("AC 59: the rules in order with their selects; the save bar only while dirty; Descartar", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    await expect(page).toHaveTitle("Regras de aprovação · Kybr");
    await expect(
      content(page).getByText(/^O que acontece com cada resultado para .+\.$/),
    ).toBeVisible();
    const selects = content(page).getByRole("combobox");
    await expect(selects).toHaveCount(7);
    await expect(selects.last()).toHaveAccessibleName("Tudo certo");
    await expect(
      content(page).getByRole("textbox", { name: "Prazo mínimo de abertura" }),
    ).toHaveValue("180");
    await expect(content(page).getByRole("switch")).toHaveCount(5);
    await expect(saveBar(page)).toHaveCount(0);

    const situacao = content(page).getByRole("combobox", {
      name: "Empresa inapta, baixada ou suspensa",
    });
    await situacao.selectOption("review");
    await expect(saveBar(page)).toBeVisible();
    await situacao.selectOption("block");
    await expect(saveBar(page)).toHaveCount(0);

    await situacao.selectOption("review");
    await saveBar(page).getByRole("button", { name: "Descartar" }).click();
    await expect(saveBar(page)).toHaveCount(0);
    await expect(situacao).toHaveValue("block");
  });

  test("Pedir documento with no document: nodocs by the card and the rule, focus on the rule", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-nodocs", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    const switches = content(page).getByRole("switch");
    for (let i = 0; i < (await switches.count()); i++) {
      const toggle = switches.nth(i);
      if ((await toggle.getAttribute("aria-checked")) === "true")
        await toggle.click();
    }
    await saveBar(page).getByRole("button", { name: "Salvar regras" }).click();
    const qsa = content(page).getByRole("combobox", {
      name: "Responsável não consta no quadro de sócios",
    });
    await expect(qsa).toBeFocused();
    await expect(qsa).toHaveAccessibleDescription(
      /Ative pelo menos um documento/,
    );
    await expect(
      content(page)
        .getByRole("region", { name: "Documentos que o link pode pedir" })
        .getByText(NODOCS),
    ).toBeVisible();
  });

  test("a Switch flips with Space; it's a switch with its label as the name", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-switch", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    const toggle = content(page).getByRole("switch").first();
    const before = await toggle.getAttribute("aria-checked");
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute(
      "aria-checked",
      before === "true" ? "false" : "true",
    );
    await expect(saveBar(page)).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(0);
  });

  test("a failed load: error.load.*", async ({ page, request }, testInfo) => {
    const email = uniqueEmail("regras-falha", testInfo);
    await createAccount(request, email);
    await seed(request, "regras-falha", email);
    await logIn(page, email, undefined, "/entrar?volta=%2Fregras");
    await expect(
      content(page).getByRole("button", { name: "Tentar de novo" }),
    ).toBeVisible();
  });
});

// T145: save, conflict and the leave guard (AC 59 second half, AC 7, Q3,
// O-F7, O-F9).

const SAVE_ERROR =
  "Não conseguimos salvar as regras. Suas mudanças continuam aqui. Tente de novo.";
const CONFLICT =
  "As regras mudaram em outra aba. Recarregue a página para ver a versão atual.";

const mei = (page: Page) =>
  content(page).getByRole("combobox", { name: "MEI" });

async function changeMei(page: Page): Promise<string> {
  const select = mei(page);
  const current = await select.inputValue();
  const next = current === "review" ? "approve" : "review";
  await select.selectOption(next);
  return next;
}

test.describe("Regras: saving and leaving @feature-ops-panel @panel-operacao @panel-regras @panel-phone", () => {
  test("save: busy, toast.rules_saved, the bar goes and focus lands on the heading; the reload shows it", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-salvar", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    const next = await changeMei(page);
    const release = await holdNextAction(page, '"mei"');
    const button = saveBar(page).getByRole("button", {
      name: /Salvar regras|Salvando/,
    });
    await button.click();
    await expect(button).toHaveAttribute("aria-busy", "true");
    release();
    await expect(page.getByText("Regras salvas")).toBeVisible(SETTLE);
    await expect(saveBar(page)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: "Regras de aprovação" }),
    ).toBeFocused();
    await page.reload();
    await expect(mei(page)).toHaveValue(next);
  });

  test("a failed save: regras.save.error in the bar, the draft kept", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-erro", testInfo);
    await createAccount(request, email);
    await sellersFault(request, email, "policy-put", "500", { times: 1 });
    await openRegras(page, email);
    const next = await changeMei(page);
    await saveBar(page).getByRole("button", { name: "Salvar regras" }).click();
    await expect(saveBar(page).getByRole("alert")).toHaveText(
      SAVE_ERROR,
      SETTLE,
    );
    await expect(mei(page)).toHaveValue(next);
  });

  test("PR2 (O-F7): saved in another tab → regras.save.conflict, no merge; its reload loads the server copy", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-conflito", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    await bumpPolicy(request, email);
    await content(page)
      .getByRole("combobox", { name: "Empresa inapta, baixada ou suspensa" })
      .selectOption("review");
    await saveBar(page).getByRole("button", { name: "Salvar regras" }).click();
    const alert = saveBar(page).getByRole("alert");
    await expect(alert).toHaveText(CONFLICT, SETTLE);
    await expect(
      content(page).getByRole("combobox", {
        name: "Empresa inapta, baixada ou suspensa",
      }),
    ).toHaveValue("review");
    // No beforeunload prompt: the reload is Renata's own choice.
    let prompted = false;
    page.on("dialog", (dialog) => {
      prompted = true;
      void dialog.accept();
    });
    await alert.getByRole("button").click();
    await expect(saveBar(page)).toHaveCount(0, SETTLE);
    await expect(
      content(page).getByRole("combobox", {
        name: "Empresa inapta, baixada ou suspensa",
      }),
    ).toHaveValue("block");
    expect(prompted).toBe(false);
  });

  test("dirty + a nav link: regras.leave.*; stay, then leave to the link", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-sair", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    await changeMei(page);
    const fila = page
      .getByRole("navigation", { name: "Navegação do painel" })
      .getByRole("link", { name: /^Fila de revisão/ });
    await fila.click();
    const dialog = page.getByRole("dialog", { name: "Sair sem salvar?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Continuar editando" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/regras$/);
    await expect(saveBar(page)).toBeVisible();

    await fila.click();
    await dialog.getByRole("button", { name: "Sair sem salvar" }).click();
    await expect(page).toHaveURL(/\/fila(\/[\w-]+)?$/, SETTLE);
  });

  test("P8-005 (D8): dirty + the account menu's Sair asks first; Sair sem salvar signs out", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-logout", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    await changeMei(page);
    const posts: string[] = [];
    page.on("request", (sent) => {
      if (sent.method() === "POST" && sent.headers()["next-action"])
        posts.push(sent.url());
    });
    const signOut = async () => {
      await page.getByRole("button", { name: "Conta" }).click();
      await page.getByRole("menuitem", { name: "Sair" }).click();
    };
    await signOut();
    const dialog = page.getByRole("dialog", { name: "Sair sem salvar?" });
    await expect(dialog).toBeVisible();
    expect(posts).toEqual([]);
    await dialog.getByRole("button", { name: "Continuar editando" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/regras$/);
    expect(posts).toEqual([]);

    await signOut();
    await dialog.getByRole("button", { name: "Sair sem salvar" }).click();
    await expect(page).toHaveURL(/\/entrar\?motivo=saiu/, SETTLE);
  });

  test("a clean draft: the nav link goes with no dialog", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-limpo", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    await page
      .getByRole("navigation", { name: "Navegação do painel" })
      .getByRole("link", { name: /^Fila de revisão/ })
      .click();
    await expect(page).toHaveURL(/\/fila(\/[\w-]+)?$/, SETTLE);
  });

  test("dirty + reload: the browser's beforeunload prompt", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-recarregar", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    // A real click: beforeunload needs the page's user activation.
    await content(page).getByRole("switch").first().click();
    const prompt = new Promise<string>((resolve) => {
      page.once("dialog", (dialog) => {
        resolve(dialog.type());
        void dialog.dismiss();
      });
    });
    void page.reload().catch(() => undefined);
    expect(await prompt).toBe("beforeunload");
    await expect(saveBar(page)).toBeVisible();
  });

  test("dirty + session expiry → /entrar with perdido=1 (AC 7)", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("regras-sessao", testInfo);
    await createAccount(request, email);
    await openRegras(page, email);
    await changeMei(page);
    await expireSessions(request, email);
    await saveBar(page).getByRole("button", { name: "Salvar regras" }).click();
    await page.waitForURL(/\/entrar\?.*perdido=1/, SETTLE);
  });

  test("F7: savePolicyAction is owned by the /regras page", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as {
      node: Record<
        string,
        { exportedName?: string; workers: Record<string, unknown> }
      >;
    };
    const entry = Object.values(manifest.node).find(
      (value) => value.exportedName === "savePolicyAction",
    );
    expect(Object.keys(entry?.workers ?? {})).toContain(
      "app/(panel)/painel/(app)/regras/page",
    );
  });
});
