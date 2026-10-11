"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/features/panel-auth/validation";
import {
  changePasswordSchema,
  settingsFields,
  settingsSchema,
  type SettingsField,
} from "@/features/panel-settings/schemas";
import type { AppError } from "@/lib/api/errors";
import { setSessionCookie } from "@/lib/api/panel/cookies";
import { assertPanelHost } from "@/lib/api/panel/host";
import { changePassword } from "@/lib/api/panel/password";
import { requireSession, sessionExpiredResult } from "@/lib/api/panel/session";
import { saveOwnName, saveWorkspace } from "@/lib/api/panel/workspace";
import { panelPath } from "@/lib/panel-paths";

export type SaveSettingsResult =
  | { ok: true }
  | { ok: false; code: "INVALID"; fields: SettingsField[] }
  | { ok: false; code: "SESSAO_EXPIRADA" | "NETWORK" | "UNAVAILABLE" };

type Failure = Exclude<SaveSettingsResult, { ok: true }>;

function failureOf(error: AppError): Failure {
  if (error.code === "SESSAO_EXPIRADA") return { ok: false, code: error.code };
  if (error.code === "NETWORK" || error.code === "TIMEOUT")
    return { ok: false, code: "NETWORK" };
  return { ok: false, code: "UNAVAILABLE" };
}

/**
 * Configurações' "Salvar alterações" (plan-m8 D4): PUT /workspace (the
 * platform name and the seller contact), then PUT /me (the own name), in
 * ADR-0011's order: host, strict zod (the onboarding contact rules, O-F8),
 * requireSession() as a result (Addendum 2), then the API. It is ok only if
 * both succeed: a failed PUT /me after a saved workspace is a failure, and
 * the retry is safe (idempotent PUTs). The seller link's cache is dropped
 * with the slug of the session's /me, never one from the client (M2-07).
 * A refused input logs nothing (shape only, F11).
 */
export async function saveSettingsAction(
  input: unknown,
): Promise<SaveSettingsResult> {
  await assertPanelHost();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID", fields: settingsFields(input) };
  let slug: string;
  try {
    slug = (await requireSession({ onMissing: "result" })).workspace.slug;
  } catch (error) {
    return sessionExpiredResult(error);
  }

  const { nome_plataforma, contato_vendedor, nome } = parsed.data;
  const workspace = await saveWorkspace({
    nome: nome_plataforma,
    contato_vendedor,
  });
  if (!workspace.ok) {
    if (workspace.error.code === "VALOR_INVALIDO")
      return {
        ok: false,
        code: "INVALID",
        fields: [
          workspace.error.field === "nome" ? "nome_plataforma" : "valor",
        ],
      };
    return failureOf(workspace.error);
  }
  // The workspace changed on the server: the link and the shell show it
  // now, whatever happens to the name (C-M8-9, AC 60).
  revalidateTag(`public-link:${slug}`);
  revalidatePath(panelPath("/"), "layout");

  const me = await saveOwnName({ nome });
  if (!me.ok) {
    if (me.error.code === "VALOR_INVALIDO")
      return { ok: false, code: "INVALID", fields: ["nome"] };
    // A partial success is a failure (O-F8): never "saved".
    return failureOf(me.error);
  }
  return { ok: true };
}

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "SENHA_ATUAL_INCORRETA"
        | "SENHA_CURTA"
        | "SENHA_FRACA"
        | "SESSAO_EXPIRADA"
        | "VALOR_INVALIDO"
        | "NETWORK";
    }
  | { ok: false; code: "LIMITE_TENTATIVAS"; retryAfterSeconds?: number };

/** The two fields of the posted form, and nothing else (O-F2). */
function passwordFields(input: unknown): Record<string, unknown> {
  if (!(input instanceof FormData)) return {};
  return {
    senha_atual: input.get("senha_atual"),
    senha_nova: input.get("senha_nova"),
  };
}

/** A well-formed request whose only problem is a short new password. */
function shortNewPassword(values: Record<string, unknown>): boolean {
  const { senha_atual: current, senha_nova: next } = values;
  return (
    typeof current === "string" &&
    current.length >= 1 &&
    current.length <= PASSWORD_MAX_LENGTH &&
    typeof next === "string" &&
    next.length < PASSWORD_MIN_LENGTH
  );
}

/**
 * "Trocar senha" (AC 60, ADR-0009; Security O-F1..O-F3), posted straight
 * by <form action> (O-F2: a POST even before hydration). ADR-0011's order:
 * host, strict zod over the two fields (1..128; the new one ≥ 12), the
 * session as a result, then D-A6. A 200 sets the cookie from the
 * response's sessao through the login's helper and schema (O-F3); any
 * other answer leaves it alone. It returns { ok } or a code, never an echo,
 * and logs nothing of its input.
 */
export async function changePasswordAction(
  input: unknown,
): Promise<ChangePasswordResult> {
  await assertPanelHost();
  const values = passwordFields(input);
  const parsed = changePasswordSchema.safeParse(values);
  if (!parsed.success)
    return {
      ok: false,
      code: shortNewPassword(values) ? "SENHA_CURTA" : "VALOR_INVALIDO",
    };
  try {
    await requireSession({ onMissing: "result" });
  } catch (error) {
    return sessionExpiredResult(error);
  }

  const result = await changePassword(parsed.data);
  if (result.ok) {
    await setSessionCookie(result.data.sessao);
    return { ok: true };
  }
  const { error } = result;
  switch (error.code) {
    case "SENHA_ATUAL_INCORRETA":
    case "SENHA_FRACA":
    case "SESSAO_EXPIRADA":
    case "VALOR_INVALIDO":
      return { ok: false, code: error.code };
    case "LIMITE_TENTATIVAS":
      return error.retryAfterSeconds === undefined
        ? { ok: false, code: "LIMITE_TENTATIVAS" }
        : {
            ok: false,
            code: "LIMITE_TENTATIVAS",
            retryAfterSeconds: error.retryAfterSeconds,
          };
    default:
      // 5xx, a dropped or malformed answer: an unknown outcome, never
      // retried; the next navigation's requireSession settles it (O-F2).
      return { ok: false, code: "NETWORK" };
  }
}
