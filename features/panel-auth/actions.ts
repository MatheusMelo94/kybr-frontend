"use server";

import { z } from "zod";

import { loginSchema } from "@/features/panel-auth/schemas";
import type { AppError } from "@/lib/api/errors";
import { panelRequest } from "@/lib/api/panel/client";
import { setSessionCookie, setSignupCookie } from "@/lib/api/panel/cookies";
import { assertPanelHost } from "@/lib/api/panel/host";
import { apiPaths } from "@/lib/api/path";
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
