// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EXPIRED_RESET_TOKEN,
  PANEL_EMAILS,
  TURNSTILE_TOKENS,
  WEAK_PASSWORD,
} from "@/tests/fixtures/factories/panel";
import {
  issueResetToken,
  openSession,
  panelStore,
  sessionAccount,
} from "@/tests/fixtures/msw/panel-store";

const state = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/lib/api/panel/cookies", () => ({}));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));

import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/features/panel-auth/actions";

beforeEach(() => {
  state.headers = new Headers({
    host: "app.kybr.test",
    "x-forwarded-for": "203.0.113.9",
  });
});

describe("requestPasswordResetAction (D-A5, AC 6)", () => {
  it("answers 404 off the panel host before any API call", async () => {
    state.headers = new Headers({ host: "kybr.test" });
    await expect(
      requestPasswordResetAction({
        email: PANEL_EMAILS.renata,
        turnstile: TURNSTILE_TOKENS.pass,
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(panelStore().calls).toEqual([]);
  });

  it("reads the same for an existing and an unknown address", async () => {
    for (const email of [PANEL_EMAILS.renata, PANEL_EMAILS.ninguem])
      expect(
        await requestPasswordResetAction({
          email,
          turnstile: TURNSTILE_TOKENS.pass,
        }),
      ).toEqual({
        ok: true,
      });
  });

  it.each([
    [
      { email: PANEL_EMAILS.renata, turnstile: TURNSTILE_TOKENS.fail },
      { ok: false, code: "TURNSTILE_INVALIDO" },
    ],
    [{ email: PANEL_EMAILS.renata }, { ok: false, code: "TURNSTILE_INVALIDO" }],
    [
      { email: PANEL_EMAILS.limite, turnstile: TURNSTILE_TOKENS.pass },
      { ok: false, code: "LIMITE_TENTATIVAS", retryAfterSeconds: 540 },
    ],
  ])("%j → %j", async (input, expected) => {
    expect(await requestPasswordResetAction(input)).toEqual(expected);
  });
});

describe("resetPasswordAction (D-A5, P04)", () => {
  it("sets the new password and every session ends", async () => {
    const old = openSession(PANEL_EMAILS.renata);
    const token = issueResetToken(PANEL_EMAILS.renata);

    expect(
      await resetPasswordAction({ token, senha: "uma-senha-nova-1" }),
    ).toEqual({ ok: true });
    expect(sessionAccount(old.id)).toBeUndefined();
    expect(panelStore().accounts.get(PANEL_EMAILS.renata)?.senha).toBe(
      "uma-senha-nova-1",
    );
  });

  it.each([
    [
      { token: EXPIRED_RESET_TOKEN, senha: "uma-senha-nova-1" },
      { ok: false, code: "TOKEN_INVALIDO" },
    ],
    [
      { token: "a".repeat(30), senha: "uma-senha-nova-1" },
      { ok: false, code: "TOKEN_INVALIDO" },
    ],
  ])("an expired or unknown token → %j", async (input, expected) => {
    expect(await resetPasswordAction(input)).toEqual(expected);
  });

  it("a breached password → SENHA_FRACA", async () => {
    const token = issueResetToken(PANEL_EMAILS.renata);
    expect(await resetPasswordAction({ token, senha: WEAK_PASSWORD })).toEqual({
      ok: false,
      code: "SENHA_FRACA",
    });
  });

  it.each([
    "",
    "curto",
    "tem espaço dentro do token aqui",
    "a".repeat(129),
    "../../etc",
  ])("a malformed token (%j) is refused before any API call", async (token) => {
    expect(
      await resetPasswordAction({ token, senha: "uma-senha-nova-1" }),
    ).toEqual({
      ok: false,
      code: "TOKEN_INVALIDO",
    });
    expect(panelStore().calls).toEqual([]);
  });

  it("a too-short password is a field error, with no API call", async () => {
    const token = issueResetToken(PANEL_EMAILS.renata);
    expect(await resetPasswordAction({ token, senha: "curta" })).toEqual({
      ok: false,
      code: "SENHA_CURTA",
    });
    expect(panelStore().calls).toEqual([]);
  });
});
