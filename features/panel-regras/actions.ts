"use server";

import { revalidatePath } from "next/cache";

import { policyDraftSchema } from "@/features/panel-regras/schemas";
import { AppError } from "@/lib/api/errors";
import { assertPanelHost } from "@/lib/api/panel/host";
import { savePolicy } from "@/lib/api/panel/policies";
import { requireSession, sessionExpiredResult } from "@/lib/api/panel/session";
import { panelPath } from "@/lib/panel-paths";

// Regras' Server Action (plan-m8 § 4; ADR-0011 order: host → zod .strict()
// → requireSession() → API → a result union). Owned by /regras.

export type SavePolicyResult =
  | { ok: true; versao: number }
  | {
      ok: false;
      code:
        | "SESSAO_EXPIRADA"
        | "VALOR_INVALIDO"
        | "POLITICA_DESATUALIZADA"
        | "SEM_DOCUMENTO_HABILITADO"
        | "NETWORK"
        | "UNAVAILABLE";
    };

/**
 * D-R1 PUT: "Salvar regras". The whole policy with the versao it was read
 * at, to the session's category (never one from the client). A stale versao
 * is POLITICA_DESATUALIZADA (regras.save.conflict): never retried, never
 * merged (O-F7). A refused input logs nothing from the parse (F11).
 */
export async function savePolicyAction(
  input: unknown,
): Promise<SavePolicyResult> {
  await assertPanelHost();
  const parsed = policyDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "VALOR_INVALIDO" };
  let categoria: string | null;
  try {
    categoria = (await requireSession({ onMissing: "result" })).workspace
      .categoria;
  } catch (error) {
    return sessionExpiredResult(error);
  }
  if (categoria === null) return { ok: false, code: "UNAVAILABLE" };

  let versao: number;
  try {
    ({ versao } = await savePolicy(categoria, parsed.data));
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    switch (error.code) {
      case "SESSAO_EXPIRADA":
      case "VALOR_INVALIDO":
      case "POLITICA_DESATUALIZADA":
      case "SEM_DOCUMENTO_HABILITADO":
      case "NETWORK":
        return { ok: false, code: error.code };
      default:
        return { ok: false, code: "UNAVAILABLE" };
    }
  }
  // /regras and the layout's /me (documentos_habilitados for Pedir documento).
  revalidatePath(panelPath("/"), "layout");
  return { ok: true, versao };
}
