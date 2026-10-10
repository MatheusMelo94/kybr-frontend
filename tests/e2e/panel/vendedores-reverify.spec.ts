import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { SETTLE, holdNextAction } from "../fixtures/fila-timing.ts";
import {
  callsFor,
  logIn,
  setPlan,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";
import {
  seedSellers,
  sellerNeedles,
  sellersFault,
  type SellerNeedle,
} from "../fixtures/sellers-mock.ts";

// T141: Reverificar (AC 56, plan-m8 D6, Q2/Q4, O-F7): confirm first, busy,
// the toast and the pending row; one key across a NETWORK retry; a 409 is
// the pending state; SEM_SALDO and a used-up plan.

const masked = (cnpj: string): string =>
  `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;

const NETWORK_ERROR =
  "Não conseguimos falar com o servidor. Confira sua conexão e tente de novo.";
const EXHAUSTED =
  "As verificações do plano acabaram. Contrate para continuar verificando.";

async function target(
  request: Parameters<typeof seedSellers>[0],
  email: string,
  n = 3,
): Promise<SellerNeedle> {
  await seedSellers(request, email);
  const needle = (await sellerNeedles(request, email)).find(
    (item) => item.n === n,
  );
  if (!needle) throw new Error(`no seller ${n}`);
  return needle;
}

/** Logs in onto /vendedores searched down to the one seller. */
async function openSeller(
  page: Page,
  email: string,
  seller: SellerNeedle,
): Promise<void> {
  const volta = `/vendedores?q=${encodeURIComponent(masked(seller.cnpj))}`;
  await logIn(
    page,
    email,
    undefined,
    `/entrar?volta=${encodeURIComponent(volta)}`,
  );
  await expect(row(page, seller)).toBeVisible();
}

const row = (page: Page, seller: SellerNeedle) =>
  page.locator(`#conteudo [data-seller-row="${seller.id}"]`);
const dialog = (page: Page) => page.getByRole("dialog");
const reverifyCalls = async (
  request: Parameters<typeof callsFor>[0],
  email: string,
) =>
  (await callsFor(request, email)).filter(
    (call) => call.method === "POST" && call.path.endsWith("/reverify"),
  );

test.describe("Vendedores: Reverificar @feature-ops-panel @panel-operacao @panel-vendedores @panel-phone", () => {
  test("AC 56: confirm first, busy, then the toast and Reverificando…", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("reverificar", testInfo);
    const seller = await target(request, email);
    await openSeller(page, email, seller);

    await row(page, seller)
      .getByRole("button", { name: "Reverificar" })
      .click();
    await expect(
      dialog(page).getByRole("heading", { name: /^Reverificar .+\?$/ }),
    ).toBeVisible();
    await expect(dialog(page)).toContainText(
      "Isso consome 1 verificação do seu plano.",
    );
    expect(await reverifyCalls(request, email)).toHaveLength(0);

    const release = await holdNextAction(page, seller.id);
    const submit = dialog(page).getByRole("button", { name: "Reverificar" });
    await submit.click();
    await expect(submit).toHaveAttribute("aria-busy", "true");
    release();

    await expect(page.getByText(/^Reverificação pedida: /)).toBeVisible(SETTLE);
    await expect(dialog(page)).toBeHidden();
    await expect(row(page, seller)).toContainText("Reverificando…");
    await expect(row(page, seller).getByRole("button")).toHaveCount(0);
    expect(await reverifyCalls(request, email)).toHaveLength(1);

    // The server's flag holds the row after a reload (no poll, Q4).
    await page.reload();
    await expect(row(page, seller)).toContainText("Reverificando…");
  });

  test("a retry after NETWORK reuses the key; the mock counts one credit", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("reverificar-rede", testInfo);
    const seller = await target(request, email);
    await setPlan(request, email, { usadas: 0, limite: 2 });
    await sellersFault(request, email, "reverify", "drop", { times: 1 });
    await openSeller(page, email, seller);

    await row(page, seller)
      .getByRole("button", { name: "Reverificar" })
      .click();
    const submit = dialog(page).getByRole("button", { name: "Reverificar" });
    await submit.click();
    await expect(dialog(page).getByRole("alert")).toHaveText(
      NETWORK_ERROR,
      SETTLE,
    );
    await submit.click();
    await expect(row(page, seller)).toContainText("Reverificando…", SETTLE);

    const calls = await reverifyCalls(request, email);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey);
    // One credit of two: the plan isn't used up, so no exhausted note.
    await page.reload();
    await expect(page.locator("#conteudo")).not.toContainText(EXHAUSTED);
  });

  test("409: a reverify already pending is the pending state, with no error", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("reverificar-409", testInfo);
    const seller = await target(request, email);
    await openSeller(page, email, seller);
    await row(page, seller)
      .getByRole("button", { name: "Reverificar" })
      .click();

    // Another tab of the same session asks first.
    const other = await page.context().newPage();
    await other.goto(
      `/vendedores?q=${encodeURIComponent(masked(seller.cnpj))}`,
    );
    await row(other, seller)
      .getByRole("button", { name: "Reverificar" })
      .click();
    await dialog(other).getByRole("button", { name: "Reverificar" }).click();
    await expect(row(other, seller)).toContainText("Reverificando…", SETTLE);
    await other.close();

    await dialog(page).getByRole("button", { name: "Reverificar" }).click();
    await expect(row(page, seller)).toContainText("Reverificando…", SETTLE);
    await expect(page.getByText(NETWORK_ERROR)).toHaveCount(0);
    const calls = await reverifyCalls(request, email);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.idempotencyKey).not.toBe(calls[0]?.idempotencyKey);
  });

  test("SEM_SALDO: plan.exhausted inline in the dialog", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("reverificar-saldo", testInfo);
    const seller = await target(request, email);
    await setPlan(request, email, { usadas: 0, limite: 2 });
    await openSeller(page, email, seller);
    await row(page, seller)
      .getByRole("button", { name: "Reverificar" })
      .click();
    await setPlan(request, email, { usadas: 2, limite: 2 });
    await dialog(page).getByRole("button", { name: "Reverificar" }).click();
    await expect(dialog(page).getByRole("alert")).toHaveText(EXHAUSTED, SETTLE);
  });

  test("the allowance used up: every Reverificar is disabled, described by plan.exhausted", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("reverificar-esgotado", testInfo);
    await seedSellers(request, email);
    await setPlan(request, email, { usadas: 5, limite: 5 });
    await logIn(page, email, undefined, "/entrar?volta=%2Fvendedores");
    const buttons = page
      .locator("#conteudo")
      .getByRole("button", { name: "Reverificar" });
    await expect(buttons.first()).toBeDisabled();
    const describedBy = await buttons.first().getAttribute("aria-describedby");
    await expect(page.locator(`#${describedBy}`)).toHaveText(EXHAUSTED);
  });

  test("O-F7 / F7: reverifyAction is owned by the /vendedores page", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as {
      node: Record<
        string,
        { exportedName?: string; workers: Record<string, unknown> }
      >;
    };
    const entry = Object.values(manifest.node).find(
      (value) => value.exportedName === "reverifyAction",
    );
    const workers = Object.keys(entry?.workers ?? {});
    expect(workers).toContain("app/(panel)/painel/(app)/vendedores/page");
  });
});
