// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PANEL_EMAILS,
  PANEL_PASSWORD,
  TURNSTILE_TOKENS,
} from "@/tests/fixtures/factories/panel";
import {
  issueTicket,
  openSession,
  panelStore,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  token: undefined as string | undefined,
}));
const reportMarker = vi.hoisted(() => vi.fn());
const cookies = vi.hoisted(() => ({
  setSessionCookie: vi.fn(),
  setSignupCookie: vi.fn(),
  deleteSignupCookie: vi.fn(),
  deleteSessionCookie: vi.fn(),
  readSignupCookie: vi.fn(),
  readSessionToken: vi.fn(async () => state.token),
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => cookies);
vi.mock("@/lib/monitoring", () => ({ reportMarker }));

import { loginAction, signupAction } from "@/features/panel-auth/actions";
import { pollShellStatusAction } from "@/features/panel-shell/actions";

function markers(): [string, Record<string, string>][] {
  return reportMarker.mock.calls as [string, Record<string, string>][];
}

/** Every marker payload, checked for the values that must never leave the server. */
function expectNoPii(...secrets: string[]): void {
  const sent = JSON.stringify(markers());
  for (const secret of [...secrets, PANEL_PASSWORD, "@exemplo.test"])
    expect(sent).not.toContain(secret);
}

beforeEach(() => {
  state.headers = new Headers({ host: "app.kybr.test" });
  state.token = undefined;
  vi.clearAllMocks();
});

describe("the panel's shape-only markers (T61, P16)", () => {
  it("AUTH_RATE_LIMITED on a 429", async () => {
    await loginAction({ email: PANEL_EMAILS.limite, senha: PANEL_PASSWORD });

    expect(markers()).toEqual([["AUTH_RATE_LIMITED", { operation: "login" }]]);
    expectNoPii();
  });

  it("TURNSTILE_FAILED when the API refuses the token", async () => {
    await signupAction({
      nome: "Pessoa",
      workspace: "Plataforma",
      email: "nova-x@exemplo.test",
      senha: "uma-senha-boa-1",
      aceite: true,
      turnstile: TURNSTILE_TOKENS.fail,
      idempotencyKey: crypto.randomUUID(),
    });

    expect(markers()).toEqual([["TURNSTILE_FAILED", { operation: "signup" }]]);
    expectNoPii(TURNSTILE_TOKENS.fail);
  });

  it("SESSION_REJECTED when a sent session gets a 401, with no token", async () => {
    const { id } = openSession(PANEL_EMAILS.renata);
    panelStore().sessions.clear();
    state.token = id;

    // requireSession() then redirects to /entrar (ADR-0011 note).
    await expect(pollShellStatusAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(markers()).toEqual([
      ["SESSION_REJECTED", { operation: "shell-status" }],
    ]);
    expectNoPii(id);
  });

  it("PANEL_HOST_MISMATCH off the panel host, with no host value", async () => {
    state.headers = new Headers({ host: "evil.example" });
    await expect(
      loginAction({ email: PANEL_EMAILS.renata, senha: PANEL_PASSWORD }),
    ).rejects.toThrow();

    expect(markers()).toEqual([["PANEL_HOST_MISMATCH", {}]]);
    expectNoPii("evil.example");
  });

  it("an ordinary failure (wrong password) sends no marker; a ticket never appears", async () => {
    const ticket = issueTicket(PANEL_EMAILS.pendente);
    await loginAction({ email: PANEL_EMAILS.renata, senha: "errada" });
    await loginAction({ email: PANEL_EMAILS.pendente, senha: PANEL_PASSWORD });

    expect(markers()).toEqual([]);
    expectNoPii(ticket);
  });
});
