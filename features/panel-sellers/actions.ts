"use server";

import { revalidatePath } from "next/cache";

import { reverifySchema } from "@/features/panel-sellers/schemas";
import { AppError } from "@/lib/api/errors";
import { assertPanelHost } from "@/lib/api/panel/host";
import { reverifySeller } from "@/lib/api/panel/sellers";
import { requireSession, sessionExpiredResult } from "@/lib/api/panel/session";
import { panelPath } from "@/lib/panel-paths";

// Vendedores' Server Action (plan-m8 § 4; ADR-0011 order: host → zod
// .strict() → requireSession() → API → a result union). Owned by
// /vendedores and /vendedores/[sellerId] (both post it, D6).

export type ReverifyResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "SESSAO_EXPIRADA"
        | "VALOR_INVALIDO"
        | "SEM_SALDO"
        | "REVERIFICACAO_EM_ANDAMENTO"
        | "SELLER_NAO_ENCONTRADO"
        | "NETWORK"
        | "UNAVAILABLE";
    };

/**
 * D-S3: Reverificar, with the client's Idempotency-Key unchanged (the key
 * lives in SellersProvider, one per seller across the list and the detail,
 * QA Q5). SEM_SALDO (402) and REVERIFICACAO_EM_ANDAMENTO (409) are
 * definitive; NETWORK and UNAVAILABLE are an unknown outcome: the client
 * keeps the key and re-reads (O-F7, M6C-01). A refused input is
 * VALOR_INVALIDO and logs nothing from the parse (F11).
 */
export async function reverifyAction(input: unknown): Promise<ReverifyResult> {
  await assertPanelHost();
  const parsed = reverifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "VALOR_INVALIDO" };
  // ADR-0011 Addendum 2: no session is a result, before any API call.
  try {
    await requireSession({ onMissing: "result" });
  } catch (error) {
    return sessionExpiredResult(error);
  }

  try {
    await reverifySeller(parsed.data.sellerId, parsed.data.idempotencyKey);
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    switch (error.code) {
      case "SESSAO_EXPIRADA":
      case "VALOR_INVALIDO":
      case "SEM_SALDO":
      case "REVERIFICACAO_EM_ANDAMENTO":
      case "SELLER_NAO_ENCONTRADO":
      case "NETWORK":
        return { ok: false, code: error.code };
      default:
        return { ok: false, code: "UNAVAILABLE" };
    }
  }
  // The list, the detail (reverificacao_pendente) and the shell's plan usage.
  revalidatePath(panelPath("/"), "layout");
  return { ok: true };
}
