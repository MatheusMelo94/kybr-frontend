// @vitest-environment node
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BATCH_SETS,
  CATEGORIES,
  PANEL_EMAILS,
} from "@/tests/fixtures/factories/panel";
import {
  newBatch,
  openSession,
  panelStore,
  seedScenario,
} from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

// T118 (ADR-0011 Addendum 2): the M4/M5 session actions return
// SESSAO_EXPIRADA instead of redirecting. No session (no cookie, an unknown
// token, /me 401) → the result with no API call past /me; /me 5xx keeps its
// own path (UNAVAILABLE); an API 401 mid-action → the same result.

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect,
}));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { saveOnboardingAction } from "@/features/panel-onboarding/actions";
import {
  monitorBatchAction,
  pollBatchAction,
  resumeBatchAction,
  sendToQueueAction,
  startBatchAction,
} from "@/features/panel-lote/actions";
import { AppError } from "@/lib/api/errors";

const KEY = "0b7f3c1e-2a4d-4e5f-8a6b-9c0d1e2f3a4b";
const BATCH = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

type Case = {
  name: string;
  email: string;
  run: () => Promise<unknown>;
  /** The API routes the action writes or reads after the session check. */
  api: string;
};

const ACTIONS: Case[] = [
  {
    name: "saveOnboardingAction",
    email: PANEL_EMAILS.nova,
    run: () =>
      saveOnboardingAction({
        contato_vendedor: { tipo: "url", valor: "https://ajuda.exemplo.test" },
        categoria: CATEGORIES[1].id,
      }),
    api: "*/v1/workspace",
  },
  {
    name: "startBatchAction",
    email: PANEL_EMAILS.pago,
    run: () =>
      startBatchAction({
        idempotencyKey: KEY,
        linhas: BATCH_SETS.tudoOk.map((cnpj) => ({ cnpj })),
      }),
    api: "*/v1/batches",
  },
  {
    name: "pollBatchAction",
    email: PANEL_EMAILS.pago,
    run: () => pollBatchAction({ batchId: BATCH }),
    api: "*/v1/batches/*",
  },
  {
    name: "sendToQueueAction",
    email: PANEL_EMAILS.pago,
    run: () => sendToQueueAction({ batchId: BATCH, idempotencyKey: KEY }),
    api: "*/v1/batches/*",
  },
  {
    name: "monitorBatchAction",
    email: PANEL_EMAILS.pago,
    run: () => monitorBatchAction({ batchId: BATCH, idempotencyKey: KEY }),
    api: "*/v1/batches/*",
  },
  {
    name: "resumeBatchAction",
    email: PANEL_EMAILS.pago,
    run: () => resumeBatchAction({ batchId: BATCH }),
    api: "*/v1/batches/*",
  },
];

const EXPIRED = { ok: false, code: "SESSAO_EXPIRADA" };

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  vi.clearAllMocks();
});

describe.each(ACTIONS)("$name (ADR-0011 Addendum 2, T118)", (action) => {
  beforeEach(() => {
    state.token = openSession(action.email).id;
  });

  it("no session cookie → SESSAO_EXPIRADA as a result, 0 API calls, no redirect", async () => {
    state.token = undefined;
    expect(await action.run()).toEqual(EXPIRED);
    expect(panelStore().calls).toEqual([]);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("a malformed or unknown session token → the same result; only /me was asked", async () => {
    state.token = "nao-e-uma-sessao";
    expect(await action.run()).toEqual(EXPIRED);
    expect(panelStore().calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /v1/me",
    ]);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("/me 401 (the session ended) → the same result, no call past /me", async () => {
    panelStore().sessions.clear();
    expect(await action.run()).toEqual(EXPIRED);
    expect(panelStore().calls.map((c) => c.path)).toEqual(["/v1/me"]);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("/me 5xx keeps its own path: UNAVAILABLE, never SESSAO_EXPIRADA", async () => {
    seedScenario("me-falha", action.email);
    const outcome = await action.run().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    expect("error" in outcome && outcome.error).toBeInstanceOf(AppError);
    expect("error" in outcome && (outcome.error as AppError).code).toBe(
      "UNAVAILABLE",
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it("an API 401 after the session check → SESSAO_EXPIRADA", async () => {
    if (action.email === PANEL_EMAILS.pago)
      newBatch(
        action.email,
        BATCH_SETS.tudoOk.map((cnpj) => ({ cnpj })),
      );
    server.use(
      http.all(action.api, () =>
        HttpResponse.json(
          { code: "SESSAO_EXPIRADA", message: "m" },
          { status: 401 },
        ),
      ),
    );
    expect(await action.run()).toEqual(EXPIRED);
    expect(redirect).not.toHaveBeenCalled();
  });
});
