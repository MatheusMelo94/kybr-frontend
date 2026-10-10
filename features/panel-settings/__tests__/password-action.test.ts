// @vitest-environment node
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PANEL_PASSWORD } from "@/tests/fixtures/factories/panel";
import {
  openSession,
  panelStore,
  seedDashboard,
  sessionsOf,
} from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const cookies = vi.hoisted(() => ({
  setSessionCookie: vi.fn(),
  readSessionToken: vi.fn(async () => state.token),
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => cookies);
const reportMarker = vi.hoisted(() => vi.fn());
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

import { changePasswordAction } from "@/features/panel-settings/actions";

// T136 (AC 60 password half; Security O-F1, O-F2, O-F3): D-A6 from
// Configurações. ADR-0011 order: host → zod → requireSession → API.

const NOVA = "uma-senha-nova-bem-longa";
let email: string;

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  data.set("$ACTION_ID_abc", "");
  data.set("username", email);
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const change = (senha_atual: string, senha_nova = NOVA) =>
  changePasswordAction(form({ senha_atual, senha_nova }));

const live = (id: string | undefined): boolean =>
  sessionsOf(email).some((session) => session.id === id && !session.revogada);

const spies: ReturnType<typeof vi.spyOn>[] = [];

beforeEach(() => {
  email = `senha-${crypto.randomUUID().slice(0, 8)}@exemplo.test`;
  seedDashboard(email, "populado");
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = openSession(email).id;
  panelStore().calls.length = 0;
  vi.clearAllMocks();
  for (const method of ["log", "info", "warn", "error", "debug"] as const)
    spies.push(vi.spyOn(console, method).mockImplementation(() => undefined));
});

afterEach(() => {
  // O-F2: nothing logged ever carries a password.
  const logged = JSON.stringify([
    ...spies.flatMap((spy) => spy.mock.calls),
    reportMarker.mock.calls,
  ]);
  expect(logged).not.toContain(PANEL_PASSWORD);
  expect(logged).not.toContain(NOVA);
  expect(logged).not.toContain("errada-errada-1");
  for (const spy of spies) spy.mockRestore();
  spies.length = 0;
});

describe("changePasswordAction (T136)", () => {
  it("answers 404 off the panel host before any API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(change(PANEL_PASSWORD)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it("O-F3: a 200 sets the cookie from the response's sessao, once; returns { ok } only", async () => {
    const before = state.token;
    const result = await change(PANEL_PASSWORD);
    expect(result).toEqual({ ok: true });
    expect(cookies.setSessionCookie).toHaveBeenCalledOnce();
    const [sessao] = cookies.setSessionCookie.mock.calls[0] as [
      { id: string; expira_em: string },
    ];
    expect(sessao.id).not.toBe(before);
    expect(live(sessao.id)).toBe(true);
    expect(live(before)).toBe(false);
    expect(Date.parse(sessao.expira_em)).toBeGreaterThan(Date.now());
  });

  it("O-F1: a wrong current password is SENHA_ATUAL_INCORRETA; no SESSION_REJECTED; the session survives", async () => {
    const result = await change("errada-errada-1");
    expect(result).toEqual({ ok: false, code: "SENHA_ATUAL_INCORRETA" });
    expect(cookies.setSessionCookie).not.toHaveBeenCalled();
    expect(reportMarker).not.toHaveBeenCalledWith(
      "SESSION_REJECTED",
      expect.anything(),
    );
    expect(live(state.token)).toBe(true);
  });

  it("O-F1: the 6th wrong attempt is LIMITE_TENTATIVAS with Retry-After", async () => {
    for (let i = 0; i < 5; i += 1) await change("errada-errada-1");
    const result = await change("errada-errada-1");
    expect(result).toEqual({
      ok: false,
      code: "LIMITE_TENTATIVAS",
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("a breached new password is SENHA_FRACA", async () => {
    expect(await change(PANEL_PASSWORD, "senhasenhasenha")).toEqual({
      ok: false,
      code: "SENHA_FRACA",
    });
    expect(cookies.setSessionCookie).not.toHaveBeenCalled();
  });

  it("a new password under 12 is SENHA_CURTA, before any API call", async () => {
    expect(await change(PANEL_PASSWORD, "curta")).toEqual({
      ok: false,
      code: "SENHA_CURTA",
    });
    expect(panelStore().calls).toEqual([]);
  });

  it.each([
    ["an empty current password", { senha_atual: "", senha_nova: NOVA }],
    ["a password over 128", { senha_atual: "a".repeat(129), senha_nova: NOVA }],
    ["a missing field", { senha_atual: "x".repeat(12) }],
  ])("O-F2: %s is VALOR_INVALIDO, nothing sent", async (_, values) => {
    expect(await changePasswordAction(form(values))).toEqual({
      ok: false,
      code: "VALOR_INVALIDO",
    });
    expect(panelStore().calls).toEqual([]);
  });

  it("not FormData: VALOR_INVALIDO", async () => {
    expect(
      await changePasswordAction({ senha_atual: "a", senha_nova: NOVA }),
    ).toEqual({ ok: false, code: "VALOR_INVALIDO" });
  });

  it("no session: SESSAO_EXPIRADA, before the API", async () => {
    state.token = undefined;
    expect(await change(PANEL_PASSWORD)).toEqual({
      ok: false,
      code: "SESSAO_EXPIRADA",
    });
    expect(
      panelStore().calls.filter((call) => call.path === "/v1/auth/password"),
    ).toEqual([]);
  });

  it.each([
    [500, { code: "ERRO" }],
    [503, { code: "INDISPONIVEL" }],
    [401, { code: "SESSAO_EXPIRADA" }],
    [403, { code: "OUTRO" }],
  ])("O-F3: a %i leaves the cookie untouched", async (status, body) => {
    server.use(
      http.post("*/v1/auth/password", () =>
        HttpResponse.json(body, { status }),
      ),
    );
    const result = await change(PANEL_PASSWORD);
    expect(result.ok).toBe(false);
    expect(cookies.setSessionCookie).not.toHaveBeenCalled();
  });

  it.each([
    ["no sessao", {}],
    [
      "an expiry in the past",
      {
        sessao: {
          id: "s".repeat(32),
          expira_em: new Date(Date.now() - 1000).toISOString(),
        },
      },
    ],
    [
      "an expiry 8 days ahead",
      {
        sessao: {
          id: "s".repeat(32),
          expira_em: new Date(Date.now() + 8 * 86_400_000).toISOString(),
        },
      },
    ],
  ])("O-F3: a 200 with %s leaves the cookie untouched", async (_, body) => {
    server.use(http.post("*/v1/auth/password", () => HttpResponse.json(body)));
    const result = await change(PANEL_PASSWORD);
    expect(result).toEqual({ ok: false, code: "NETWORK" });
    expect(cookies.setSessionCookie).not.toHaveBeenCalled();
  });

  it("O-F2: a dropped response is NETWORK, sent once (no auto-retry)", async () => {
    let hits = 0;
    server.use(
      http.post("*/v1/auth/password", () => {
        hits += 1;
        return HttpResponse.error();
      }),
    );
    expect(await change(PANEL_PASSWORD)).toEqual({
      ok: false,
      code: "NETWORK",
    });
    expect(hits).toBe(1);
    expect(cookies.setSessionCookie).not.toHaveBeenCalled();
  });
});
