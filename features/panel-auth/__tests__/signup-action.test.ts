// @vitest-environment node
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PANEL_EMAILS,
  TURNSTILE_TOKENS,
  WEAK_PASSWORD,
} from "@/tests/fixtures/factories/panel";
import { panelStore, seedScenario } from "@/tests/fixtures/msw/panel-store";
import { server } from "@/tests/fixtures/msw/server";

const state = vi.hoisted(() => ({ headers: new Headers() }));
const cookies = vi.hoisted(() => ({
  setSessionCookie: vi.fn(),
  setSignupCookie: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => cookies);
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import { signupAction } from "@/features/panel-auth/actions";

function input(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nome: "Pessoa Exemplo",
    workspace: "Plataforma Exemplo",
    email: "nova-conta@exemplo.test",
    senha: "senha-boa-e-longa",
    aceite: true,
    turnstile: TURNSTILE_TOKENS.pass,
    idempotencyKey: crypto.randomUUID(),
    ...over,
  };
}

beforeEach(() => {
  state.headers = new Headers({
    host: "app.kybr.test",
    "x-forwarded-for": "203.0.113.9",
  });
  vi.clearAllMocks();
});

describe("signupAction (D-A1, ADR-0009 rule 10)", () => {
  it("answers 404 off the panel host before any API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(signupAction(input())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it("creates the account, sends the terms version, and keeps the ticket + prefill (never the password) in the sign-up cookie", async () => {
    let body: Record<string, unknown> = {};
    let key: string | null = null;
    server.events.on("request:start", async ({ request }) => {
      if (request.url.endsWith("/v1/auth/signup")) {
        key = request.headers.get("idempotency-key");
        body = (await request.clone().json()) as Record<string, unknown>;
      }
    });
    const args = input();
    expect(await signupAction(args)).toEqual({ ok: true });
    server.events.removeAllListeners();

    expect(key).toBe(args.idempotencyKey);
    expect(body).toMatchObject({
      aceite_termos_versao: "teste-1",
      turnstile: TURNSTILE_TOKENS.pass,
    });
    expect(body).not.toHaveProperty("aceite");
    expect(cookies.setSignupCookie).toHaveBeenCalledWith({
      ticket: expect.stringMatching(/^[A-Za-z0-9_-]{22,}$/),
      nome: "Pessoa Exemplo",
      workspace: "Plataforma Exemplo",
      email: "nova-conta@exemplo.test",
      reenviarEm: expect.any(String),
    });
    expect(JSON.stringify(cookies.setSignupCookie.mock.calls)).not.toContain(
      "senha-boa-e-longa",
    );
  });

  it("a replay with the same key creates one account (A-X7)", async () => {
    const args = input({ email: "dobro@exemplo.test" });
    await Promise.all([signupAction(args), signupAction(args)]);

    expect(panelStore().signups.get("dobro@exemplo.test")).toBe(1);
  });

  it.each([
    [
      input({ email: PANEL_EMAILS.existente }),
      { ok: false, code: "EMAIL_EM_USO" },
    ],
    [input({ senha: WEAK_PASSWORD }), { ok: false, code: "SENHA_FRACA" }],
    [
      input({ email: "x@descartavel.test" }),
      { ok: false, code: "TESTE_INDISPONIVEL" },
    ],
    [
      input({ email: PANEL_EMAILS.limite }),
      { ok: false, code: "LIMITE_TENTATIVAS", retryAfterSeconds: 540 },
    ],
    [
      input({ turnstile: TURNSTILE_TOKENS.fail }),
      { ok: false, code: "TURNSTILE_INVALIDO" },
    ],
    [input({ senha: "queda-de-rede" }), { ok: false, code: "NETWORK" }],
  ])("maps the API's answer (%#)", async (args, expected) => {
    expect(await signupAction(args)).toEqual(expected);
    expect(cookies.setSignupCookie).not.toHaveBeenCalled();
  });

  it("maps TESTE_PAUSADO", async () => {
    seedScenario("teste-pausado");
    expect(await signupAction(input())).toEqual({
      ok: false,
      code: "TESTE_PAUSADO",
    });
  });

  it("maps a VALOR_INVALIDO field to that field's error", async () => {
    server.use(
      http.post("*/v1/auth/signup", () =>
        HttpResponse.json(
          { code: "VALOR_INVALIDO", field: "nome", message: "x" },
          { status: 422 },
        ),
      ),
    );
    expect(await signupAction(input())).toEqual({
      ok: false,
      code: "INVALID",
      fields: ["nome"],
    });
  });

  it("refuses a payload the schema rejects (a missing token included), with no API call", async () => {
    expect(await signupAction(input({ turnstile: "" }))).toEqual({
      ok: false,
      code: "TURNSTILE_INVALIDO",
    });
    expect(await signupAction(input({ aceite: false }))).toEqual({
      ok: false,
      code: "INVALID",
      fields: ["aceite"],
    });
    expect(panelStore().calls).toEqual([]);
  });
});
