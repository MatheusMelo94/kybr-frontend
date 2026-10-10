"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import {
  settingsFields,
  settingsSchema,
  type SettingsField,
} from "@/features/panel-settings/schemas";
import type { AppError } from "@/lib/api/errors";
import { assertPanelHost } from "@/lib/api/panel/host";
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
