// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AC16,
  BATCH_SETS,
  PANEL_EMAILS,
} from "@/tests/fixtures/factories/panel";
import { advanceBatch } from "@/tests/fixtures/msw/handlers/panel-batches";
import {
  newBatch,
  openSession,
  panelStore,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const revalidatePath = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import {
  monitorBatchAction,
  sendToQueueAction,
} from "@/features/panel-lote/actions";
import { panelPath } from "@/lib/panel-paths";

const KEY = "2d9b5e3a-4c6f-4a71-8c8d-1e2f3a4b5c6d";
let id: string;

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(PANEL_EMAILS.pago).id;
  vi.clearAllMocks();
  const batch = newBatch(PANEL_EMAILS.pago, AC16.linhas);
  for (let i = 0; i < 4; i++) advanceBatch(batch);
  id = batch.id;
});

const posts = (suffix: string) =>
  panelStore().calls.filter(
    (call) => call.method === "POST" && call.path.endsWith(suffix),
  );

describe("sendToQueueAction (D-B5, AC 23)", () => {
  it("creates the cases with the key, revalidates the batch page and the layout (Fila count)", async () => {
    const result = await sendToQueueAction({
      batchId: id,
      idempotencyKey: KEY,
    });
    expect(result).toEqual({ ok: true, count: expect.any(Number) });
    expect(posts("/to-queue")).toHaveLength(1);
    expect(revalidatePath).toHaveBeenCalledWith(panelPath(`/lote/${id}`));
    expect(revalidatePath).toHaveBeenCalledWith(panelPath("/"), "layout");
  });

  it("twice with the same key: the same count, cases created once (PB6)", async () => {
    const first = await sendToQueueAction({ batchId: id, idempotencyKey: KEY });
    const again = await sendToQueueAction({ batchId: id, idempotencyKey: KEY });
    expect(again).toEqual(first);
  });

  it.each([
    ["a bad id", { batchId: "../x", idempotencyKey: KEY }],
    [
      "a non-uuid key",
      { batchId: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", idempotencyKey: "x" },
    ],
    [
      "an extra field",
      {
        batchId: "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b",
        idempotencyKey: KEY,
        x: 1,
      },
    ],
  ])("refuses %s before any API call", async (_, input) => {
    expect(await sendToQueueAction(input)).toEqual({
      ok: false,
      code: "FAILED",
    });
    expect(posts("/to-queue")).toEqual([]);
  });

  it("while processing (409 LOTE_EM_ANDAMENTO) or for a foreign batch → FAILED", async () => {
    const running = newBatch(
      PANEL_EMAILS.pago,
      BATCH_SETS.tudoOk.map((cnpj) => ({ cnpj })),
    );
    expect(
      await sendToQueueAction({ batchId: running.id, idempotencyKey: KEY }),
    ).toEqual({
      ok: false,
      code: "FAILED",
    });
    state.token = openSession(PANEL_EMAILS.outro).id;
    expect(
      await sendToQueueAction({ batchId: id, idempotencyKey: KEY }),
    ).toEqual({
      ok: false,
      code: "FAILED",
    });
  });

  it("off the panel host: 404; no session: /entrar", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(
      sendToQueueAction({ batchId: id, idempotencyKey: KEY }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    state.headers = new Headers({ host: "app.kybr.test" });
    state.token = undefined;
    await expect(
      sendToQueueAction({ batchId: id, idempotencyKey: KEY }),
    ).rejects.toThrow("NEXT_REDIRECT /entrar?motivo=sessao");
  });
});

describe("monitorBatchAction (D-B5, AC 24 panel half)", () => {
  it("turns monitoring on for the successful rows and revalidates the batch page", async () => {
    expect(
      await monitorBatchAction({ batchId: id, idempotencyKey: KEY }),
    ).toEqual({
      ok: true,
      count: 181,
    });
    expect(revalidatePath).toHaveBeenCalledWith(panelPath(`/lote/${id}`));
  });
});
