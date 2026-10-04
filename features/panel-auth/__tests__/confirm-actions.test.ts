// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CODES,
  PANEL_EMAILS,
  PANEL_PASSWORD,
  TURNSTILE_TOKENS,
} from "@/tests/fixtures/factories/panel";
import { issueTicket, panelStore } from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  pending: null as null | {
    ticket: string;
    nome: string;
    workspace: string;
    email: string;
    reenviarEm?: string;
  },
}));
const cookies = vi.hoisted(() => ({
  setSessionCookie: vi.fn(),
  setSignupCookie: vi.fn(),
  deleteSignupCookie: vi.fn(),
  readSignupCookie: vi.fn(async () => state.pending),
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => cookies);
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import {
  confirmEmailAction,
  loginAction,
  resendCodeAction,
} from "@/features/panel-auth/actions";

function pendingFor(email: string): string {
  const ticket = issueTicket(email);
  state.pending = { ticket, nome: "Pessoa", workspace: "Plataforma", email };
  return ticket;
}

beforeEach(() => {
  state.headers = new Headers({
    host: "app.kybr.test",
    "x-forwarded-for": "203.0.113.9",
  });
  state.pending = null;
  vi.clearAllMocks();
});

describe("confirmEmailAction (D-A2, ADR-0009 rule 10)", () => {
  it("answers 404 off the panel host before any API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(confirmEmailAction({ codigo: "123456" })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(panelStore().calls).toEqual([]);
  });

  it("with the right code: the session cookie, the sign-up cookie deleted, /comecar", async () => {
    pendingFor(PANEL_EMAILS.pendente);
    const { codigo } = panelStore().outbox.get(PANEL_EMAILS.pendente) ?? {};

    expect(await confirmEmailAction({ codigo })).toEqual({
      ok: true,
      next: "/comecar",
    });
    expect(cookies.setSessionCookie).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.any(String) }),
    );
    expect(cookies.deleteSignupCookie).toHaveBeenCalledOnce();
  });

  it("takes the ticket from the cookie, never from the client (a forged ticket is ignored)", async () => {
    pendingFor(PANEL_EMAILS.pendente);
    const forged = issueTicket(PANEL_EMAILS.nova);
    const { codigo } = panelStore().outbox.get(PANEL_EMAILS.nova) ?? {};

    const result = await confirmEmailAction({
      codigo,
      ticket: forged,
      signup_ticket: forged,
    });

    expect(result).toEqual({ ok: false, code: "CODIGO_INCORRETO" });
    // The forged ticket was never used: its code is still pending.
    expect(panelStore().tickets.has(forged)).toBe(true);
  });

  it.each([
    [CODES.wrong, { ok: false, code: "CODIGO_INCORRETO" }],
    [CODES.expired, { ok: false, code: "CODIGO_EXPIRADO" }],
    ["12345", { ok: false, code: "CODIGO_INCORRETO" }],
  ])("code %s → %j", async (codigo, expected) => {
    pendingFor(PANEL_EMAILS.pendente);
    expect(await confirmEmailAction({ codigo })).toEqual(expected);
  });

  it("without a pending sign-up it sends back to /cadastro", async () => {
    expect(await confirmEmailAction({ codigo: "123456" })).toEqual({
      ok: false,
      code: "SEM_CADASTRO",
    });
    expect(panelStore().calls).toEqual([]);
  });
});

describe("resendCodeAction (D-A3)", () => {
  it("needs Turnstile, sends the cookie's ticket, and returns when the next resend unlocks", async () => {
    pendingFor(PANEL_EMAILS.pendente);

    expect(
      await resendCodeAction({ turnstile: TURNSTILE_TOKENS.fail }),
    ).toEqual({
      ok: false,
      code: "TURNSTILE_INVALIDO",
    });
    const result = await resendCodeAction({ turnstile: TURNSTILE_TOKENS.pass });
    expect(result).toEqual({ ok: true, resendInMs: expect.any(Number) });
    if (result.ok) expect(result.resendInMs).toBeGreaterThan(50_000);
    expect(cookies.setSignupCookie).toHaveBeenCalledWith(
      expect.objectContaining({
        email: PANEL_EMAILS.pendente,
        reenviarEm: expect.any(String),
      }),
    );
  });

  it("maps a 429 with its Retry-After", async () => {
    pendingFor(PANEL_EMAILS.limite);
    expect(
      await resendCodeAction({ turnstile: TURNSTILE_TOKENS.pass }),
    ).toEqual({
      ok: false,
      code: "LIMITE_TENTATIVAS",
      retryAfterSeconds: 540,
    });
  });
});

describe("loginAction from an unconfirmed account (Q5)", () => {
  it("keeps the API's reenviar_em, so S2's countdown is already running", async () => {
    await loginAction({ email: PANEL_EMAILS.pendente, senha: PANEL_PASSWORD });

    expect(cookies.setSignupCookie).toHaveBeenCalledWith(
      expect.objectContaining({ reenviarEm: expect.any(String) }),
    );
  });
});
