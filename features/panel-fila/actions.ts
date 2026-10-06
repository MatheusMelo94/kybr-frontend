"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  decideSchema,
  requestDocumentsSchema,
} from "@/features/panel-fila/schemas";
import { AppError, type DecisaoAnterior } from "@/lib/api/errors";
import { decideCase, requestDocuments } from "@/lib/api/panel/cases";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession, sessionExpiredResult } from "@/lib/api/panel/session";
import { panelPath } from "@/lib/panel-paths";
import { safeReturnPath } from "@/lib/safe-return-path";

// The Fila's Server Actions (plan-m6 § 3.2; ADR-0011 order: host → zod
// .strict() → requireSession() → API → a result union). Owned by
// /fila/[caseId] and always posted from it (ADR-0008 Addendum 2, D13, F7).
// Nothing here logs the seller's note or the seller's link.

export type DecideResult =
  | { ok: true }
  | {
      ok: false;
      code: "CASO_JA_DECIDIDO";
      decididoEm?: string;
      decisao?: DecisaoAnterior;
    }
  | {
      ok: false;
      code:
        | "SESSAO_EXPIRADA"
        | "NETWORK"
        | "VALOR_INVALIDO"
        | "MOTIVO_OBRIGATORIO"
        | "CASO_NAO_ENCONTRADO"
        | "UNAVAILABLE";
    };

/**
 * F7: the page the POST came from, as the middleware set it (never the
 * client's), path only. It lets the request log show which page owned it.
 */
async function pagePath(): Promise<string | undefined> {
  const path = safeReturnPath((await headers()).get("x-kybr-panel-path"));
  return path === null ? undefined : path.split("?")[0];
}

/**
 * D-C3 from /fila/[caseId]: Aprovar, Manter aprovado or Bloquear, with the
 * client's Idempotency-Key unchanged (F5: the key lives in FilaProvider).
 * `NETWORK` tells the client the outcome is unknown (keep the key); the
 * rest are definitive (T106: a 5xx is UNAVAILABLE, a definitive failure).
 * A refused input is VALOR_INVALIDO and logs nothing from the parse (F11).
 */
export async function decideAction(input: unknown): Promise<DecideResult> {
  await assertPanelHost();
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "VALOR_INVALIDO" };
  // ADR-0011 Addendum 2: no session is a result, before any API call.
  try {
    await requireSession({ onMissing: "result" });
  } catch (error) {
    return sessionExpiredResult(error);
  }

  const { caseId, idempotencyKey, decisao, motivoCodigo, notaVendedor } =
    parsed.data;
  try {
    await decideCase(
      caseId,
      { decisao, motivoCodigo, notaVendedor },
      idempotencyKey,
      { pagePath: await pagePath() },
    );
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return decideFailure(error);
  }
  // The shell's counts and the Fila's lists.
  revalidatePath(panelPath("/"), "layout");
  return { ok: true };
}

export type RequestDocumentsResult =
  | { ok: true; linkVendedor?: string }
  | Exclude<DecideResult, { ok: true }>
  | { ok: false; code: "DOCUMENTO_NAO_HABILITADO" };

/**
 * D-C4 from /fila/[caseId]: Pedir documento, in the same order and with the
 * same key rule as decideAction. `linkVendedor` (no seller e-mail) has
 * passed parseLinkVendedor in the data function (F8); an invalid one is
 * dropped there with only a marker.
 */
export async function requestDocumentsAction(
  input: unknown,
): Promise<RequestDocumentsResult> {
  await assertPanelHost();
  const parsed = requestDocumentsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "VALOR_INVALIDO" };
  try {
    await requireSession({ onMissing: "result" });
  } catch (error) {
    return sessionExpiredResult(error);
  }

  const { caseId, idempotencyKey, tipos, notaVendedor } = parsed.data;
  let linkVendedor: string | undefined;
  try {
    ({ linkVendedor } = await requestDocuments(
      caseId,
      { tipos, notaVendedor },
      idempotencyKey,
      { pagePath: await pagePath() },
    ));
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return error.code === "DOCUMENTO_NAO_HABILITADO"
      ? { ok: false, code: error.code }
      : decideFailure(error);
  }
  revalidatePath(panelPath("/"), "layout");
  return { ok: true, ...(linkVendedor !== undefined && { linkVendedor }) };
}

function decideFailure(error: AppError): Exclude<DecideResult, { ok: true }> {
  switch (error.code) {
    case "CASO_JA_DECIDIDO":
      return {
        ok: false,
        code: "CASO_JA_DECIDIDO",
        ...(error.decididoEm !== undefined && { decididoEm: error.decididoEm }),
        ...(error.decisao !== undefined && { decisao: error.decisao }),
      };
    case "SESSAO_EXPIRADA":
    case "NETWORK":
    case "VALOR_INVALIDO":
    case "MOTIVO_OBRIGATORIO":
    case "CASO_NAO_ENCONTRADO":
      return { ok: false, code: error.code };
    default:
      return { ok: false, code: "UNAVAILABLE" };
  }
}
