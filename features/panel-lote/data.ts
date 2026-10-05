import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { ApiResult } from "@/lib/api/client";
import { getBatch, listBatches } from "@/lib/api/panel/batches";
import { sessionExpiredUrl } from "@/lib/api/panel/session";
import type { Batch, BatchHistory } from "@/lib/api/schemas/panel/batches";

// Lote's reads for its layouts and pages. React cache() (the only memoization
// allowed for panel data, P06) makes a layout and its page share one request:
// the layouts run the 404 and the D1 redirect above the loading boundary (so
// the status is real and nothing flashes), and the pages render the data.

/** D-B2 for a page render: one GET per request. */
export const loadBatch = cache((id: string): Promise<ApiResult<Batch>> =>
  getBatch(id),
);

/** D-B6 for a page render: one GET per request. */
export const loadHistory = cache((): Promise<ApiResult<BatchHistory>> =>
  listBatches(),
);

/**
 * The batch, or the way out: unknown or foreign → notFound() (the same for
 * both, A-X3); an ended session → /entrar; anything else throws to error.tsx.
 */
export async function batchOrExit(id: string): Promise<Batch> {
  const result = await loadBatch(id);
  if (result.ok) return result.data;
  if (result.error.code === "LOTE_NAO_ENCONTRADO") notFound();
  if (result.error.code === "SESSAO_EXPIRADA")
    redirect(await sessionExpiredUrl());
  throw result.error;
}

/** The history, or undefined when its read failed (shown inline); an ended session → /entrar. */
export async function historyOrError(): Promise<BatchHistory | undefined> {
  const result = await loadHistory();
  if (result.ok) return result.data;
  if (result.error.code === "SESSAO_EXPIRADA")
    redirect(await sessionExpiredUrl());
  return undefined;
}
