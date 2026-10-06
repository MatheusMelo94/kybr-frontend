import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import {
  caseSeed,
  casesFor,
  seedCases,
  type MockCase,
} from "../fixtures/fila-mock.ts";
import { MOCK_API } from "../fixtures/mock-api.ts";
import {
  callsFor,
  createAccount,
  expireSessions,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T110: new cases (AC 39, AC 40; D3; ADR-0011 rule 3 + Addendum 2; E4; F10).
// The poll runs every 60 s and once on becoming visible: the tests fire the
// visibilitychange instead of waiting a minute.

type Request = Parameters<typeof casesFor>[0];

const CONTROLS = `${MOCK_API}/__mock/panel`;

async function createCase(
  request: Request,
  email: string,
  slaInMs: number,
): Promise<MockCase> {
  const response = await request.post(`${CONTROLS}/cases`, {
    data: { email, slaInMs },
  });
  expect(response.status()).toBe(201);
  const [created] = (await response.json()) as MockCase[];
  if (!created) throw new Error("createCase");
  return created;
}

async function openCases(request: Request, email: string) {
  return (await casesFor(request, email)).filter((c) => c.estado === "aberto");
}

/** The poll's "once on becoming visible". */
async function poll(page: Page): Promise<void> {
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
}

const options = (page: Page) => page.getByRole("listbox").getByRole("option");
const notice = (page: Page) =>
  page.getByRole("status").filter({ hasText: /casos? novos?/ });

test.describe("Fila: new cases (T110) @feature-ops-panel @panel-fila", () => {
  test("AC 40: a new case → fila.new.one + Mostrar; order and selection kept, even after a decision's revalidation; Mostrar shows it in SLA order", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-novo", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first, second] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await expect(options(page)).toHaveCount(2);

    // Due first: it would sort to the top.
    const fresh = await createCase(request, email, 60_000);
    await poll(page);
    await expect(notice(page)).toHaveText(/1 caso novo/);
    await expect(page.getByRole("button", { name: "Mostrar" })).toBeVisible();
    await expect(options(page)).toHaveCount(2);
    await expect(options(page).first()).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // A decision revalidates the list: the new case stays hidden.
    await page
      .getByRole("button", { name: /^(Aprovar|Manter aprovado)$/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first()).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.getByRole("button", { name: "Mostrar" }).click();
    // useRefreshUntil retries a dropped refresh every 2 s (Next 15.5, plan
    // § 17 drift 2): under parallel load the re-read can take a retry or two.
    await expect(options(page)).toHaveCount(2, { timeout: 15_000 });
    await expect(options(page).first()).toContainText(fresh.razao_social ?? "");
    await expect(notice(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/fila/${second?.id}$`));
  });

  test("AC 39: an upload on a waiting case → after the poll and Mostrar it's in Para decidir, with Documento recebido in its history", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-upload", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    // Pedir documento moves the first case to Aguardando vendedor.
    await page
      .getByRole("button", { name: "Pedir documento", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("checkbox", { name: "Cartão CNPJ atualizado" })
      .check();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Pedir documento" })
      .click();
    await expect(page).not.toHaveURL(new RegExp(`/fila/${first?.id}$`));
    await expect(options(page)).toHaveCount(1);

    const upload = await request.post(`${CONTROLS}/cases/${first?.id}/upload`, {
      data: { tipo: "CARTAO_CNPJ" },
    });
    expect(upload.status()).toBe(204);
    await poll(page);
    await expect(notice(page)).toHaveText(/1 caso novo/);
    await page.getByRole("button", { name: "Mostrar" }).click();
    await expect(options(page)).toHaveCount(2, { timeout: 15_000 });
    await page.goto(`/fila/${first?.id}`);
    await expect(page.getByText(/^Documento recebido/)).toBeVisible();
  });

  test("F10: a poll's backend calls all carry X-Kybr-Poll: 1 (the session's /me and the desde count); the poll never refreshes the page", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-novo-f10", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await expect(options(page)).toHaveCount(2);
    // The page's own reads (and any prefetch) are done before the poll.
    await page.waitForLoadState("networkidle");
    const before = (await callsFor(request, email)).length;
    const documents: string[] = [];
    page.on("request", (r) => {
      if (r.isNavigationRequest() || r.headers()["rsc"] === "1")
        documents.push(r.url());
    });
    await createCase(request, email, 60_000);
    await poll(page);
    await expect(notice(page)).toBeVisible();
    const calls = (await callsFor(request, email)).slice(before);
    const count = calls.filter(
      (call) =>
        call.path.startsWith("/v1/cases?") && call.path.includes("desde="),
    );
    expect(count.length).toBeGreaterThanOrEqual(1);
    expect(calls.some((call) => call.path === "/v1/me")).toBe(true);
    for (const call of calls)
      expect([call.path, call.poll]).toEqual([call.path, true]);
    expect(documents).toEqual([]);
  });

  test("a failed poll (poll-falha) keeps the last state silently", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-novo-falha", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await createCase(request, email, 60_000);
    await caseSeed(request, email, "poll-falha", { n: 1 });
    const counts = async () =>
      (await callsFor(request, email)).filter((call) =>
        call.path.includes("desde="),
      ).length;
    await poll(page);
    // The failed count landed (and its action returned) before the next poll.
    await expect.poll(counts).toBe(1);
    await page.waitForTimeout(500);
    await expect(notice(page)).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveCount(
      0,
    );
    await poll(page);
    await expect(notice(page)).toHaveText(/1 caso novo/);
  });

  test("Addendum 2: an expired session at the poll → the session-expiry path once, with perdido=1 when a Fila dialog is dirty", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("fila-novo-sessao", testInfo);
    await createAccount(request, email);
    await seedCases(request, email, "dois");
    const [first] = await openCases(request, email);
    await logIn(page, email);
    await page.goto(`/fila/${first?.id}`);
    await page.getByRole("button", { name: "Bloquear", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("radio", { name: "Outro motivo" })
      .check();
    await expireSessions(request, email);
    await poll(page);
    await expect(page).toHaveURL(/\/entrar\?.*perdido=1/);
    expect(new URL(page.url()).searchParams.get("volta")).toBe(
      `/fila/${first?.id}`,
    );
  });

  test("ownership: both Fila pages own pollNewCasesAction (a layout leaf); decideAction stays /fila/[caseId]'s only", async () => {
    const manifest = JSON.parse(
      readFileSync(".next/server/server-reference-manifest.json", "utf8"),
    ) as {
      node: Record<
        string,
        { exportedName?: string; workers: Record<string, unknown> }
      >;
    };
    const workersOf = (name: string) =>
      Object.keys(
        Object.values(manifest.node).find(
          (value) => value.exportedName === name,
        )?.workers ?? {},
      );
    expect(workersOf("pollNewCasesAction")).toEqual(
      expect.arrayContaining([
        "app/(panel)/painel/(app)/fila/page",
        "app/(panel)/painel/(app)/fila/[caseId]/page",
      ]),
    );
    for (const name of ["decideAction", "requestDocumentsAction"])
      expect(workersOf(name)).not.toContain(
        "app/(panel)/painel/(app)/fila/page",
      );
  });
});
