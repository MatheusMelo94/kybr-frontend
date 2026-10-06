// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BATCH_SETS, CATEGORIES } from "@/tests/fixtures/factories/panel";

// T118, ADR-0011 Addendum 2 decision 7 (Security): each migrated action
// asks requireSession() in result mode and maps ONLY
// AppError('SESSAO_EXPIRADA'); notFound(), another AppError and a plain
// Error thrown inside it keep their path. No catch-all.

const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/panel/session", async (actual) => ({
  ...(await actual<typeof import("@/lib/api/panel/session")>()),
  requireSession,
}));
vi.mock("@/lib/api/panel/host", () => ({ assertPanelHost: async () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { saveOnboardingAction } from "@/features/panel-onboarding/actions";
import {
  monitorBatchAction,
  pollBatchAction,
  resumeBatchAction,
  sendToQueueAction,
  startBatchAction,
} from "@/features/panel-lote/actions";
import { POLL_TIMEOUT_MS } from "@/features/panel-shell/polling";
import { AppError } from "@/lib/api/errors";

const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const BATCH = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const ACTIONS: [string, () => Promise<unknown>, object][] = [
  [
    "saveOnboardingAction",
    () =>
      saveOnboardingAction({
        contato_vendedor: { tipo: "url", valor: "https://ajuda.exemplo.test" },
        categoria: CATEGORIES[1].id,
      }),
    { onMissing: "result" },
  ],
  [
    "startBatchAction",
    () =>
      startBatchAction({
        idempotencyKey: KEY,
        linhas: BATCH_SETS.tudoOk.map((cnpj) => ({ cnpj })),
      }),
    { onMissing: "result" },
  ],
  [
    "pollBatchAction",
    () => pollBatchAction({ batchId: BATCH }),
    { onMissing: "result", pollTimeoutMs: POLL_TIMEOUT_MS },
  ],
  [
    "sendToQueueAction",
    () => sendToQueueAction({ batchId: BATCH, idempotencyKey: KEY }),
    { onMissing: "result" },
  ],
  [
    "monitorBatchAction",
    () => monitorBatchAction({ batchId: BATCH, idempotencyKey: KEY }),
    { onMissing: "result" },
  ],
  [
    "resumeBatchAction",
    () => resumeBatchAction({ batchId: BATCH }),
    { onMissing: "result" },
  ],
];

beforeEach(() => vi.clearAllMocks());

describe.each(ACTIONS)(
  "%s: the result-mode wrapper (decision 7)",
  (_, run, options) => {
    it("asks requireSession in result mode", async () => {
      requireSession.mockRejectedValueOnce(
        new AppError({ code: "SESSAO_EXPIRADA" }),
      );
      expect(await run()).toEqual({ ok: false, code: "SESSAO_EXPIRADA" });
      expect(requireSession).toHaveBeenCalledWith(options);
    });

    it.each([
      ["notFound()", new Error("NEXT_NOT_FOUND")],
      ["AppError('UNAVAILABLE')", new AppError({ code: "UNAVAILABLE" })],
      ["a plain Error", new Error("boom")],
    ])(
      "%s thrown inside keeps its path (never SESSAO_EXPIRADA)",
      async (__, error) => {
        requireSession.mockRejectedValueOnce(error);
        await expect(run()).rejects.toBe(error);
      },
    );
  },
);
