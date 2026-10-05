// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AC16,
  BATCH_SETS,
  PANEL_EMAILS,
  cnpjWithRoot,
} from "@/tests/fixtures/factories/panel";
import {
  openSession,
  panelStore,
  seedScenario,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const revalidatePath = vi.hoisted(() => vi.fn());
const reportMarker = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

import { startBatchAction } from "@/features/panel-lote/actions";
import { panelPath } from "@/lib/panel-paths";

const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const TUDO_OK = BATCH_SETS.tudoOk.map((cnpj) => ({ cnpj }));

const batchPosts = () =>
  panelStore().calls.filter(
    (call) => call.method === "POST" && call.path === "/v1/batches",
  );

let consoleSpies: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(PANEL_EMAILS.pago).id;
  vi.clearAllMocks();
  consoleSpies = (["log", "warn", "error", "info"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => undefined),
  );
});

/** P16: nothing logged or reported carries a CNPJ. */
function expectNoCnpjInLogs(): void {
  const logged = JSON.stringify([
    ...consoleSpies.map((spy) => spy.mock.calls),
    reportMarker.mock.calls,
  ]);
  for (const linha of [...TUDO_OK, ...AC16.linhas.slice(0, 3)])
    expect(logged).not.toContain(linha.cnpj);
}

describe("startBatchAction (D-B1; ADR-0011 order; ADR-0012 item 8)", () => {
  it("off the panel host: 404 before anything", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(
      startBatchAction({ idempotencyKey: KEY, linhas: TUDO_OK }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it.each([
    [
      "5,001 rows",
      {
        idempotencyKey: KEY,
        linhas: Array.from({ length: 5001 }, (_, i) => ({
          cnpj: cnpjWithRoot(`7${String(i).padStart(7, "0")}0001`),
        })),
      },
    ],
    [
      "a duplicate CNPJ",
      { idempotencyKey: KEY, linhas: [TUDO_OK[0], TUDO_OK[0]] },
    ],
    [
      "a bad check digit",
      { idempotencyKey: KEY, linhas: [{ cnpj: "11222333000100" }] },
    ],
    ["an extra field", { idempotencyKey: KEY, linhas: TUDO_OK, extra: 1 }],
    [
      "an extra row field",
      { idempotencyKey: KEY, linhas: [{ cnpj: TUDO_OK[0]?.cnpj, nota: "x" }] },
    ],
    ["a non-uuid key", { idempotencyKey: "nao-uuid", linhas: TUDO_OK }],
    ["no rows", { idempotencyKey: KEY, linhas: [] }],
    ["not an object", "linhas"],
  ])("refuses %s before any API call", async (_, input) => {
    expect(await startBatchAction(input)).toEqual({
      ok: false,
      code: "INVALID",
    });
    expect(batchPosts()).toEqual([]);
  });

  it("no session: requireSession() redirects to /entrar, no API call", async () => {
    state.token = undefined;
    await expect(
      startBatchAction({ idempotencyKey: KEY, linhas: TUDO_OK }),
    ).rejects.toThrow("NEXT_REDIRECT /entrar?motivo=sessao");
    expect(batchPosts()).toEqual([]);
  });

  it("starts the batch with the key, revalidates the panel layout, and answers its id", async () => {
    const result = await startBatchAction({
      idempotencyKey: KEY,
      linhas: TUDO_OK,
    });
    expect(result).toEqual({ ok: true, id: expect.any(String) });
    expect(batchPosts()).toEqual([
      expect.objectContaining({ rows: 3, idempotencyKey: KEY }),
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(panelPath("/"), "layout");
    expectNoCnpjInLogs();
  });

  it("the same key twice: one batch (PB5)", async () => {
    const first = await startBatchAction({
      idempotencyKey: KEY,
      linhas: TUDO_OK,
    });
    const second = await startBatchAction({
      idempotencyKey: KEY,
      linhas: TUDO_OK,
    });
    expect(second).toEqual(first);
    expect(
      [...panelStore().batches.values()].filter(
        (b) => b.email === PANEL_EMAILS.pago,
      ),
    ).toHaveLength(2); // + the boot-time one
  });

  it("402 → SEM_SALDO with disponiveis (AC 18, server side)", async () => {
    state.token = openSession("cem@exemplo.test").id;
    expect(
      await startBatchAction({ idempotencyKey: KEY, linhas: AC16.linhas }),
    ).toEqual({
      ok: false,
      code: "SEM_SALDO",
      disponiveis: 100,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expectNoCnpjInLogs();
  });

  it("a session that ended after the check → SESSAO_EXPIRADA", async () => {
    const token = state.token;
    // The DAL's /me passes, then the API refuses the bearer.
    const { server } = await import("@/tests/fixtures/msw/server");
    const { http, HttpResponse } = await import("msw");
    server.use(
      http.post("*/v1/batches", () =>
        HttpResponse.json({ code: "SESSAO_EXPIRADA" }, { status: 401 }),
      ),
    );
    expect(token).toBeDefined();
    expect(
      await startBatchAction({ idempotencyKey: KEY, linhas: TUDO_OK }),
    ).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
  });

  it("the connection drops → NETWORK, and nothing is logged with the rows", async () => {
    seedScenario("queda-de-rede-lote", PANEL_EMAILS.pago);
    expect(
      await startBatchAction({ idempotencyKey: KEY, linhas: TUDO_OK }),
    ).toEqual({
      ok: false,
      code: "NETWORK",
    });
    expectNoCnpjInLogs();
  });
});
