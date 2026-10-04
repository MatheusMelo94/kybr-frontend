"use server";

import { z } from "zod";

import {
  confirmSchema,
  loginSchema,
  resendSchema,
  resetConfirmSchema,
  resetRequestSchema,
  signupIssues,
  signupSchema,
  type SignupField,
} from "@/features/panel-auth/schemas";
import type { AppError } from "@/lib/api/errors";
import { panelRequest } from "@/lib/api/panel/client";
import {
  deleteSessionCookie,
  deleteSignupCookie,
  readSessionToken,
  readSignupCookie,
  setSessionCookie,
  setSignupCookie,
} from "@/lib/api/panel/cookies";
import { assertPanelHost } from "@/lib/api/panel/host";
import { apiPaths } from "@/lib/api/path";
import { isNewPassword } from "@/features/panel-auth/validation";
import { env } from "@/lib/env";
import { safeReturnPath } from "@/lib/safe-return-path";

// The panel's auth actions (plan § 3.4; ADR-0009). Public POST endpoints:
// assertPanelHost() first (P03.2), then zod, then the API. Cookies are set
// only from values the API returned. Arguments are never logged.

const sessaoSchema = z.object({
  sessao: z.object({ id: z.string().min(16).max(512), expira_em: z.string() }),
});

/** Codes every auth form maps to copy; anything else reads as NETWORK. */
type CommonFailure =
  | { ok: false; code: "LIMITE_TENTATIVAS"; retryAfterSeconds?: number }
  | { ok: false; code: "TURNSTILE_INVALIDO" | "NETWORK" };

function commonFailure(error: AppError): CommonFailure {
  if (error.code === "LIMITE_TENTATIVAS")
    return error.retryAfterSeconds === undefined
      ? { ok: false, code: "LIMITE_TENTATIVAS" }
      : {
          ok: false,
          code: "LIMITE_TENTATIVAS",
          retryAfterSeconds: error.retryAfterSeconds,
        };
  if (error.code === "TURNSTILE_INVALIDO")
    return { ok: false, code: "TURNSTILE_INVALIDO" };
  // 5xx, network, timeout, an unexpected shape: the network copy (plan § 2.9).
  return { ok: false, code: "NETWORK" };
}

/** Where S2 shows login.notice.unconfirmed (spec v1.2 Q5). No PII in the URL. */
const CONFIRM_FROM_LOGIN = "/cadastro/confirmar?origem=login";

export type LoginResult =
  | { ok: true; next: string }
  | { ok: false; code: "CREDENCIAIS_INVALIDAS" | "TURNSTILE_REQUERIDO" }
  | { ok: false; code: "EMAIL_NAO_CONFIRMADO"; next: string }
  | CommonFailure;

/** D-A4: logs in, rotates the session cookie and returns the safe next path. */
export async function loginAction(input: unknown): Promise<LoginResult> {
  await assertPanelHost();
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "CREDENCIAIS_INVALIDAS" };
  const { email, senha, turnstile, volta } = parsed.data;

  const result = await panelRequest({
    operation: "login",
    path: apiPaths.panel.login(),
    method: "POST",
    body: { email, senha, ...(turnstile !== undefined && { turnstile }) },
    schema: sessaoSchema,
    forwardClientIp: true,
  });
  if (result.ok) {
    // A new id replaces any previous cookie value (rotation, A-X1).
    await setSessionCookie(result.data.sessao);
    return { ok: true, next: safeReturnPath(volta) ?? "/" };
  }
  const { error } = result;
  switch (error.code) {
    case "CREDENCIAIS_INVALIDAS":
    case "TURNSTILE_REQUERIDO":
      return { ok: false, code: error.code };
    case "EMAIL_NAO_CONFIRMADO":
      if (error.signupTicket === undefined)
        return { ok: false, code: "NETWORK" };
      // The API already sent a new code; S2 needs the ticket and the address.
      await setSignupCookie({
        ticket: error.signupTicket,
        nome: "",
        workspace: "",
        email,
        ...(error.reenviarEm !== undefined && { reenviarEm: error.reenviarEm }),
      });
      return {
        ok: false,
        code: "EMAIL_NAO_CONFIRMADO",
        next: CONFIRM_FROM_LOGIN,
      };
    default:
      return commonFailure(error);
  }
}

const signupResponseSchema = z.object({
  signup_ticket: z.string().min(16).max(512),
  reenviar_em: z.string().max(64).optional(),
});

/** API field names (A-X2 VALOR_INVALIDO.field) to the form's. */
const API_FIELDS: Record<string, SignupField> = {
  nome: "nome",
  workspace: "workspace",
  email: "email",
  senha: "senha",
  aceite_termos_versao: "aceite",
};

export type SignupResult =
  | { ok: true }
  | { ok: false; code: "INVALID"; fields: SignupField[] }
  | {
      ok: false;
      code:
        "EMAIL_EM_USO" | "SENHA_FRACA" | "TESTE_INDISPONIVEL" | "TESTE_PAUSADO";
    }
  | CommonFailure;

/**
 * D-A1: creates the workspace and its login, unconfirmed. Keeps the API's
 * ticket and the prefill (never the password) in the sign-up cookie for S2
 * (P19: no PII in a URL). The Idempotency-Key makes a double tap one account.
 */
export async function signupAction(input: unknown): Promise<SignupResult> {
  await assertPanelHost();
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    const fields = Object.keys(
      signupIssues(parsed.error.issues),
    ) as SignupField[];
    // The token is the widget's, not a field: its failure has its own copy.
    return fields.length > 0
      ? { ok: false, code: "INVALID", fields }
      : { ok: false, code: "TURNSTILE_INVALIDO" };
  }
  const { nome, workspace, email, senha, turnstile, idempotencyKey } =
    parsed.data;

  const result = await panelRequest({
    operation: "signup",
    path: apiPaths.panel.signup(),
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: {
      nome,
      workspace,
      email,
      senha,
      aceite_termos_versao: env.LEGAL_TERMS_VERSION,
      turnstile,
    },
    schema: signupResponseSchema,
    forwardClientIp: true,
  });
  if (result.ok) {
    await setSignupCookie({
      ticket: result.data.signup_ticket,
      nome,
      workspace,
      email,
      ...(result.data.reenviar_em !== undefined && {
        reenviarEm: result.data.reenviar_em,
      }),
    });
    return { ok: true };
  }
  const { error } = result;
  switch (error.code) {
    case "EMAIL_EM_USO":
    case "SENHA_FRACA":
    case "TESTE_INDISPONIVEL":
    case "TESTE_PAUSADO":
      return { ok: false, code: error.code };
    case "VALOR_INVALIDO": {
      const field = API_FIELDS[error.field ?? ""];
      return field
        ? { ok: false, code: "INVALID", fields: [field] }
        : { ok: false, code: "NETWORK" };
    }
    default:
      return commonFailure(error);
  }
}

export type ConfirmResult =
  | { ok: true; next: string }
  | { ok: false; code: "CODIGO_INCORRETO" | "CODIGO_EXPIRADO" | "SEM_CADASTRO" }
  | CommonFailure;

/**
 * D-A2: confirms the e-mail with the ticket from the sign-up cookie (never a
 * client value), starts the session and drops the pending sign-up.
 */
export async function confirmEmailAction(
  input: unknown,
): Promise<ConfirmResult> {
  await assertPanelHost();
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "CODIGO_INCORRETO" };
  const pending = await readSignupCookie();
  if (pending === null) return { ok: false, code: "SEM_CADASTRO" };

  const result = await panelRequest({
    operation: "confirm",
    path: apiPaths.panel.confirm(),
    method: "POST",
    body: { signup_ticket: pending.ticket, codigo: parsed.data.codigo },
    schema: sessaoSchema,
    forwardClientIp: true,
  });
  if (result.ok) {
    await setSessionCookie(result.data.sessao);
    await deleteSignupCookie();
    return { ok: true, next: "/comecar" };
  }
  const { error } = result;
  if (error.code === "CODIGO_INCORRETO" || error.code === "CODIGO_EXPIRADO")
    return { ok: false, code: error.code };
  return commonFailure(error);
}

const resendResponseSchema = z.object({
  reenviar_em: z.string().max(64).optional(),
});

/** The 60 s spacing between resends (contract D-A1), when the API gives no time. */
const RESEND_SPACING_MS = 60_000;

export type ResendResult =
  | { ok: true; resendInMs: number }
  | { ok: false; code: "SEM_CADASTRO" }
  | CommonFailure;

/** D-A3: mails a new code for the cookie's ticket, behind Turnstile. */
export async function resendCodeAction(input: unknown): Promise<ResendResult> {
  await assertPanelHost();
  const parsed = resendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "TURNSTILE_INVALIDO" };
  const pending = await readSignupCookie();
  if (pending === null) return { ok: false, code: "SEM_CADASTRO" };

  const result = await panelRequest({
    operation: "confirm-resend",
    path: apiPaths.panel.confirmResend(),
    method: "POST",
    body: { signup_ticket: pending.ticket, turnstile: parsed.data.turnstile },
    schema: resendResponseSchema,
    forwardClientIp: true,
  });
  if (!result.ok) return commonFailure(result.error);
  const at = Date.parse(result.data.reenviar_em ?? "");
  const resendInMs = Number.isFinite(at)
    ? Math.max(0, at - Date.now())
    : RESEND_SPACING_MS;
  await setSignupCookie({
    ...pending,
    reenviarEm: new Date(Date.now() + resendInMs).toISOString(),
  });
  return { ok: true, resendInMs };
}

export type ResetRequestResult = { ok: true } | CommonFailure;

/**
 * D-A5 request: 202 whether or not the account exists, so the result reads
 * the same for any address (AC 6, P12). Behind Turnstile.
 */
export async function requestPasswordResetAction(
  input: unknown,
): Promise<ResetRequestResult> {
  await assertPanelHost();
  const parsed = resetRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "TURNSTILE_INVALIDO" };

  const result = await panelRequest({
    operation: "password-reset",
    path: apiPaths.panel.passwordReset(),
    method: "POST",
    body: parsed.data,
    schema: z.unknown(),
    forwardClientIp: true,
  });
  return result.ok ? { ok: true } : commonFailure(result.error);
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; code: "TOKEN_INVALIDO" | "SENHA_CURTA" | "SENHA_FRACA" }
  | CommonFailure;

/**
 * D-A5 confirm: sets the new password with the token the leaf read from the
 * URL fragment (P04: it never travels in a URL). A malformed token is
 * refused before any API call. Success revokes every session (the API).
 */
export async function resetPasswordAction(
  input: unknown,
): Promise<ResetPasswordResult> {
  await assertPanelHost();
  const parsed = resetConfirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "TOKEN_INVALIDO" };
  if (!isNewPassword(parsed.data.senha))
    return { ok: false, code: "SENHA_CURTA" };

  const result = await panelRequest({
    operation: "password-reset-confirm",
    path: apiPaths.panel.passwordResetConfirm(),
    method: "POST",
    body: parsed.data,
    schema: z.unknown(),
    forwardClientIp: true,
  });
  if (result.ok) return { ok: true };
  const { error } = result;
  if (error.code === "TOKEN_INVALIDO" || error.code === "SENHA_FRACA")
    return { ok: false, code: error.code };
  return commonFailure(error);
}

/** Where logout lands: a full page load drops the client's router cache (P15). */
const AFTER_LOGOUT = "/entrar?motivo=saiu";

/**
 * D-A4 logout (ADR-0009 rule 8, P15): a POST only (a <form>, never a link or
 * a GET). Revokes the session server-side, then deletes the cookie even if
 * that call failed, so this browser is logged out either way.
 */
export async function logoutAction(): Promise<{ ok: true; next: string }> {
  await assertPanelHost();
  const token = await readSessionToken();
  if (token !== undefined) {
    await panelRequest({
      operation: "logout",
      path: apiPaths.panel.logout(),
      method: "POST",
      schema: z.unknown(),
      sessionToken: token,
    });
  }
  await deleteSessionCookie();
  return { ok: true, next: AFTER_LOGOUT };
}
