"use server";

import { pollNewCasesSchema } from "@/features/panel-fila/schemas";
import { POLL_TIMEOUT_MS } from "@/features/panel-shell/polling";
import { AppError } from "@/lib/api/errors";
import { countNewCases } from "@/lib/api/panel/cases";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession, sessionExpiredResult } from "@/lib/api/panel/session";

// The Fila's read-only poll (plan-m6 § 3.2; ADR-0011 order and rule 3). A
// module of its own: its leaf sits in the Fila layout, so both pages own
// it, and the write actions in actions.ts stay owned by /fila/[caseId] only
// (ADR-0008 Addendum 2, F7).

export type NewCasesResult =
  | { ok: true; novos: number }
  | { ok: false; code: "FAILED" | "SESSAO_EXPIRADA" | "VALOR_INVALIDO" };

/**
 * The Fila's new-case poll (D-C1 `desde`, C-M6-1; ADR-0011 rule 3): a count
 * for the notice, nothing else. Both backend calls, the session's /me and
 * the count, carry X-Kybr-Poll (F10) and the poll timeout, so a poll never
 * slides the idle session. No session is SESSAO_EXPIRADA, a result
 * (Addendum 2); any other failure is FAILED, which the leaf ignores.
 */
export async function pollNewCasesAction(
  input: unknown,
): Promise<NewCasesResult> {
  await assertPanelHost();
  const parsed = pollNewCasesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "VALOR_INVALIDO" };
  try {
    await requireSession({
      pollTimeoutMs: POLL_TIMEOUT_MS,
      onMissing: "result",
    });
    const novos = await countNewCases(parsed.data.desde, {
      pollTimeoutMs: POLL_TIMEOUT_MS,
    });
    return { ok: true, novos };
  } catch (error) {
    if (error instanceof AppError && error.code !== "SESSAO_EXPIRADA")
      return { ok: false, code: "FAILED" };
    return sessionExpiredResult(error);
  }
}
