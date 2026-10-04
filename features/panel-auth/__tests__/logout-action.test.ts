// @vitest-environment node
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PANEL_EMAILS } from "@/tests/fixtures/factories/panel";
import {
  openSession,
  panelStore,
  sessionAccount,
} from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const cookies = vi.hoisted(() => ({ deleteSessionCookie: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => ({
  ...cookies,
  readSessionToken: async () => state.token,
}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { logoutAction } from "@/features/panel-auth/actions";

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(PANEL_EMAILS.renata).id;
  vi.clearAllMocks();
});

describe("logoutAction (D-A4, ADR-0009 rule 8, P15)", () => {
  it("answers 404 off the panel host", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(logoutAction()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("revokes the session server-side and deletes the cookie", async () => {
    const token = state.token;
    expect(await logoutAction()).toEqual({
      ok: true,
      next: "/entrar?motivo=saiu",
    });
    expect(sessionAccount(token)).toBeUndefined();
    expect(panelStore().logouts).toEqual([PANEL_EMAILS.renata]);
    expect(cookies.deleteSessionCookie).toHaveBeenCalledOnce();
  });

  it("deletes the cookie even when the API call fails", async () => {
    server.use(http.post("*/v1/auth/logout", () => HttpResponse.error()));
    expect(await logoutAction()).toEqual({
      ok: true,
      next: "/entrar?motivo=saiu",
    });
    expect(cookies.deleteSessionCookie).toHaveBeenCalledOnce();
  });

  it("with no cookie, makes no API call and still clears", async () => {
    state.token = undefined;
    expect(await logoutAction()).toEqual({
      ok: true,
      next: "/entrar?motivo=saiu",
    });
    expect(panelStore().calls).toEqual([]);
  });
});
