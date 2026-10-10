// @vitest-environment node
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PANEL_EMAILS,
  PANEL_PASSWORD,
  TURNSTILE_TOKENS,
} from "@/tests/fixtures/factories/panel";
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
const cookies = vi.hoisted(() => ({
  setSessionCookie: vi.fn(),
  setSignupCookie: vi.fn(),
  deleteSignupCookie: vi.fn(),
  readSessionToken: vi.fn(async () => state.token),
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => cookies);
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { loginAction } from "@/features/panel-auth/actions";
import { PANEL_HOME } from "@/lib/panel-paths";

beforeEach(() => {
  state.headers = new Headers({
    host: "app.kybr.test",
    "x-forwarded-for": "203.0.113.9",
  });
  state.token = undefined;
  vi.clearAllMocks();
});

const login = (input: Record<string, unknown>) => loginAction(input);

describe("loginAction (D-A4, ADR-0009)", () => {
  it("answers 404 off the panel host before any API call (P03.2)", async () => {
    state.headers = new Headers({ host: "kybr.test" });

    await expect(
      login({ email: PANEL_EMAILS.renata, senha: PANEL_PASSWORD }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it("sets the session cookie from the API's sessao and returns the safe volta", async () => {
    const result = await login({
      email: PANEL_EMAILS.renata,
      senha: PANEL_PASSWORD,
      volta: "/fila?aba=x",
    });

    expect(result).toEqual({ ok: true, next: "/fila?aba=x" });
    expect(cookies.setSessionCookie).toHaveBeenCalledWith({
      id: expect.stringMatching(/^[A-Za-z0-9_-]{22,}$/),
      expira_em: expect.any(String),
    });
  });

  it.each([
    "//evil.example",
    "https://evil.example",
    "/\\evil.example",
    "/v/loja",
    "/entrar",
  ])("ignores the unsafe volta %j and goes home", async (volta) => {
    expect(
      await login({ email: PANEL_EMAILS.renata, senha: PANEL_PASSWORD, volta }),
    ).toEqual({
      ok: true,
      next: PANEL_HOME,
    });
  });

  it("goes straight to the home screen, not to / and a second hop (P4-009)", async () => {
    // M8 D1 (T131): the home is Início, /.
    expect(PANEL_HOME).toBe("/");
    expect(
      await login({ email: PANEL_EMAILS.renata, senha: PANEL_PASSWORD }),
    ).toEqual({ ok: true, next: "/" });
  });

  it("drops a pending sign-up cookie on success only (M4-01)", async () => {
    await login({ email: PANEL_EMAILS.renata, senha: "senha-errada-000" });
    expect(cookies.deleteSignupCookie).not.toHaveBeenCalled();

    await login({ email: PANEL_EMAILS.renata, senha: PANEL_PASSWORD });
    expect(cookies.deleteSignupCookie).toHaveBeenCalledOnce();
  });

  it("hands the API the session this browser held, so a success revokes it (M4-06)", async () => {
    const previous = openSession(PANEL_EMAILS.renata).id;
    state.token = previous;

    expect(
      await login({ email: PANEL_EMAILS.renata, senha: "senha-errada-000" }),
    ).toEqual({ ok: false, code: "CREDENCIAIS_INVALIDAS" });
    expect(sessionAccount(previous)).toBeDefined();

    expect(
      (await login({ email: PANEL_EMAILS.renata, senha: PANEL_PASSWORD })).ok,
    ).toBe(true);
    expect(sessionAccount(previous)).toBeUndefined();
  });

  it("maps wrong credentials to CREDENCIAIS_INVALIDAS, setting no cookie", async () => {
    expect(
      await login({ email: PANEL_EMAILS.renata, senha: "errada" }),
    ).toEqual({
      ok: false,
      code: "CREDENCIAIS_INVALIDAS",
    });
    expect(cookies.setSessionCookie).not.toHaveBeenCalled();
  });

  it("forwards the client IP and the Turnstile token, never logging the password", async () => {
    let seen: Headers | undefined;
    server.events.on("request:start", ({ request }) => {
      if (request.url.endsWith("/v1/auth/login")) seen = request.headers;
    });
    await login({
      email: PANEL_EMAILS.renata,
      senha: PANEL_PASSWORD,
      turnstile: TURNSTILE_TOKENS.pass,
    });
    server.events.removeAllListeners();

    expect(seen?.get("x-kybr-client-ip")).toBe("203.0.113.9");
    expect(panelStore().calls.at(-1)).toMatchObject({
      turnstile: TURNSTILE_TOKENS.pass,
    });
  });

  it("passes TURNSTILE_REQUERIDO and TURNSTILE_INVALIDO through", async () => {
    panelStore().loginFailures.set(`${PANEL_EMAILS.renata}|203.0.113.9`, 3);

    expect(
      await login({ email: PANEL_EMAILS.renata, senha: PANEL_PASSWORD }),
    ).toEqual({
      ok: false,
      code: "TURNSTILE_REQUERIDO",
    });
    expect(
      await login({
        email: PANEL_EMAILS.renata,
        senha: PANEL_PASSWORD,
        turnstile: TURNSTILE_TOKENS.fail,
      }),
    ).toEqual({ ok: false, code: "TURNSTILE_INVALIDO" });
  });

  it("maps a 429 to LIMITE_TENTATIVAS with Retry-After", async () => {
    expect(
      await login({ email: PANEL_EMAILS.limite, senha: PANEL_PASSWORD }),
    ).toEqual({
      ok: false,
      code: "LIMITE_TENTATIVAS",
      retryAfterSeconds: 540,
    });
  });

  it("an unconfirmed e-mail: stores the API's ticket in the sign-up cookie and sends to S2", async () => {
    const result = await login({
      email: PANEL_EMAILS.pendente,
      senha: PANEL_PASSWORD,
    });

    expect(result).toEqual({
      ok: false,
      code: "EMAIL_NAO_CONFIRMADO",
      next: "/cadastro/confirmar?origem=login",
    });
    expect(cookies.setSignupCookie).toHaveBeenCalledWith({
      ticket: expect.stringMatching(/^[A-Za-z0-9_-]{22,}$/),
      nome: "",
      workspace: "",
      email: PANEL_EMAILS.pendente,
      reenviarEm: expect.any(String),
    });
    expect(cookies.setSessionCookie).not.toHaveBeenCalled();
  });

  it.each([
    ["a dropped connection", () => HttpResponse.error()],
    [
      "a 5xx",
      () => HttpResponse.json({ code: "X", message: "m" }, { status: 503 }),
    ],
  ])("maps %s to NETWORK", async (_, reply) => {
    server.use(http.post("*/v1/auth/login", reply));

    expect(
      await login({ email: PANEL_EMAILS.renata, senha: PANEL_PASSWORD }),
    ).toEqual({
      ok: false,
      code: "NETWORK",
    });
  });

  it("refuses an invalid payload as wrong credentials, with no API call", async () => {
    expect(await login({ email: "", senha: "" })).toEqual({
      ok: false,
      code: "CREDENCIAIS_INVALIDAS",
    });
    expect(panelStore().calls).toEqual([]);
  });
});
