// @vitest-environment node
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PANEL_EMAILS } from "@/tests/fixtures/factories/panel";
import {
  ageSession,
  openSession,
  panelStore,
} from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => ({
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { pollShellStatusAction } from "@/features/panel-shell/actions";
import { POLL_TIMEOUT_MS } from "@/features/panel-shell/polling";

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(PANEL_EMAILS.renata).id;
});

describe("pollShellStatusAction (ADR-0011 rule 3, AC 11)", () => {
  it("answers 404 off the panel host", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(pollShellStatusAction()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns only { contagens, plano }: a minimal projection", async () => {
    const result = await pollShellStatusAction();

    expect(result).toEqual({
      ok: true,
      contagens: expect.objectContaining({ fila_abertos: 7, fila_vencidos: 2 }),
      plano: expect.objectContaining({ tipo: "teste" }),
    });
    expect(Object.keys(result).sort()).toEqual(["contagens", "ok", "plano"]);
    expect(JSON.stringify(result)).not.toContain(PANEL_EMAILS.renata);
  });

  it("maps a 401 to SESSAO_EXPIRADA", async () => {
    panelStore().sessions.clear();
    expect(await pollShellStatusAction()).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
  });

  it("no cookie: SESSAO_EXPIRADA with no API call", async () => {
    state.token = undefined;
    expect(await pollShellStatusAction()).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    expect(panelStore().calls).toEqual([]);
  });

  it("any other failure is FAILED (the leaf hides the counts)", async () => {
    server.use(
      http.get("*/v1/me", () =>
        HttpResponse.json({ code: "X", message: "m" }, { status: 503 }),
      ),
    );
    expect(await pollShellStatusAction()).toEqual({
      ok: false,
      code: "FAILED",
    });
  });

  it("doesn't keep the session alive: a poll leaves the idle clock where it was (Q2)", async () => {
    const id = state.token as string;
    ageSession(id, 60 * 60_000);
    const before = panelStore().sessions.get(id)?.lastActivity;

    expect((await pollShellStatusAction()).ok).toBe(true);
    expect(panelStore().sessions.get(id)?.lastActivity).toBe(before);
  });

  it("polls with a short timeout (4 s, plan § 2.3)", () => {
    expect(POLL_TIMEOUT_MS).toBe(4_000);
  });
});
