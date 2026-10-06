// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BATCH_SETS,
  FOREIGN_BATCH_ID,
  PANEL_EMAILS,
} from "@/tests/fixtures/factories/panel";
import {
  newBatch,
  openSession,
  panelStore,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { pollBatchAction } from "@/features/panel-lote/actions";

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(PANEL_EMAILS.pago).id;
  vi.clearAllMocks();
});

const batchReads = () =>
  panelStore().calls.filter(
    (call) => call.method === "GET" && call.path.startsWith("/v1/batches/"),
  );

describe("pollBatchAction (D-B2, ADR-0011 rule 3)", () => {
  it("answers the batch's progress, polled: X-Kybr-Poll on /me and on the batch read", async () => {
    const batch = newBatch(
      PANEL_EMAILS.pago,
      BATCH_SETS.tudoOk.map((cnpj) => ({ cnpj })),
    );
    const result = await pollBatchAction({ batchId: batch.id });
    expect(result).toEqual({
      ok: true,
      batch: {
        estado: "processando",
        total: 3,
        processados: 1,
        // P5-006: D-B2 carries the counts so far; the legend shows them live.
        contagens: { ok: 1, warn: 0, bad: 0, erro: 0 },
      },
    });
    const calls = panelStore().calls.filter((call) => call.authorized);
    expect(calls.map((call) => [call.path, call.poll])).toEqual([
      ["/v1/me", true],
      [`/v1/batches/${batch.id}`, true],
    ]);
  });

  it("off the panel host: 404 before anything", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(
      pollBatchAction({ batchId: FOREIGN_BATCH_ID }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it.each([
    ["a short id", { batchId: "lote_ABCDEFGHIJKLMNOP" }],
    ["a traversal", { batchId: "../../me" }],
    ["an extra field", { batchId: FOREIGN_BATCH_ID, x: 1 }],
    ["no id", {}],
  ])("refuses %s with no API call", async (_, input) => {
    expect(await pollBatchAction(input)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(batchReads()).toEqual([]);
  });

  it("a foreign batch → NOT_FOUND (A-X3)", async () => {
    state.token = openSession(PANEL_EMAILS.outro).id;
    expect(await pollBatchAction({ batchId: FOREIGN_BATCH_ID })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
  });

  it("no session: SESSAO_EXPIRADA as a result (ADR-0011 Addendum 2)", async () => {
    state.token = undefined;
    expect(await pollBatchAction({ batchId: FOREIGN_BATCH_ID })).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
  });

  it("a failed read (PB11) → FAILED", async () => {
    const { seedPollFailures } =
      await import("@/tests/fixtures/msw/panel-store");
    seedPollFailures(1, PANEL_EMAILS.pago);
    expect(await pollBatchAction({ batchId: FOREIGN_BATCH_ID })).toEqual({
      ok: false,
      code: "FAILED",
    });
  });
});
