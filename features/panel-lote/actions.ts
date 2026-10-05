"use server";

import { revalidatePath } from "next/cache";

import { startBatchSchema } from "@/features/panel-lote/schemas";
import { startBatch } from "@/lib/api/panel/batches";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession } from "@/lib/api/panel/session";
import { panelPath } from "@/lib/panel-paths";

// Lote's Server Actions (plan M5; ADR-0011 order: host → zod .strict() →
// requireSession() → API → a result union). Each is posted only from the
// page that owns it (ADR-0008 Addendum 2). Nothing here logs the rows (P16).

export type StartResult =
  | { ok: true; id: string }
  | { ok: false; code: "INVALID" | "SESSAO_EXPIRADA" | "NETWORK" }
  | { ok: false; code: "SEM_SALDO"; disponiveis: number };

/**
 * D-B1, from /lote: the worker's de-duplicated rows with the preview's
 * Idempotency-Key, so a double click or a retry starts one batch (A-X7). A
 * tampered call (more than 5,000 rows, a duplicate or a bad CNPJ, an extra
 * field, a key that isn't a uuid) is refused before any API call.
 */
export async function startBatchAction(input: unknown): Promise<StartResult> {
  await assertPanelHost();
  const parsed = startBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID" };
  await requireSession();

  const linhas = parsed.data.linhas.map(({ cnpj, responsavel, ext_id }) => ({
    cnpj,
    ...(responsavel !== undefined && { responsavel }),
    ...(ext_id !== undefined && { ext_id }),
  }));
  const result = await startBatch(linhas, parsed.data.idempotencyKey);
  if (result.ok) {
    // The shell's lote_em_andamento and the plan's usage come from /me.
    revalidatePath(panelPath("/"), "layout");
    return { ok: true, id: result.data.id };
  }
  const { error } = result;
  if (error.code === "SESSAO_EXPIRADA")
    return { ok: false, code: "SESSAO_EXPIRADA" };
  if (error.code === "SEM_SALDO")
    return {
      ok: false,
      code: "SEM_SALDO",
      disponiveis: error.disponiveis ?? 0,
    };
  // MUITAS_LINHAS, SEM_CNPJ_VALIDO, VALOR_INVALIDO: the worker already
  // filtered, so these are unexpected; like a network failure, retryable.
  return { ok: false, code: "NETWORK" };
}
