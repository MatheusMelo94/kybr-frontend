"use server";

import { revalidatePath } from "next/cache";

import {
  batchRefSchema,
  batchWriteSchema,
  startBatchSchema,
} from "@/features/panel-lote/schemas";
import { POLL_TIMEOUT_MS } from "@/features/panel-shell/polling";
import {
  getBatch,
  monitorBatch,
  resumeBatch,
  sendToQueue,
  startBatch,
} from "@/lib/api/panel/batches";
import type { Batch } from "@/lib/api/schemas/panel/batches";
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

export type PollResult =
  | { ok: true; batch: Pick<Batch, "estado" | "total" | "processados"> }
  | { ok: false; code: "NOT_FOUND" | "SESSAO_EXPIRADA" | "FAILED" };

/**
 * A read-only action for BatchProgress, from /lote/[batchId] (ADR-0011 rule
 * 3): the batch's progress, nothing else. requireSession() and the batch
 * read both carry X-Kybr-Poll, so a poll never slides the idle session
 * (M4-02, C7), with the poll's 4 s timeout. A bad, unknown or foreign id is
 * NOT_FOUND; any other failure is FAILED (the leaf shows it as stale).
 */
export async function pollBatchAction(input: unknown): Promise<PollResult> {
  await assertPanelHost();
  const parsed = batchRefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "NOT_FOUND" };
  await requireSession({ pollTimeoutMs: POLL_TIMEOUT_MS });

  const result = await getBatch(parsed.data.batchId, {
    pollTimeoutMs: POLL_TIMEOUT_MS,
  });
  if (result.ok) {
    const { estado, total, processados } = result.data;
    return { ok: true, batch: { estado, total, processados } };
  }
  if (result.error.code === "LOTE_NAO_ENCONTRADO")
    return { ok: false, code: "NOT_FOUND" };
  if (result.error.code === "SESSAO_EXPIRADA")
    return { ok: false, code: "SESSAO_EXPIRADA" };
  return { ok: false, code: "FAILED" };
}

export type BatchWriteResult =
  | { ok: true; count: number }
  | { ok: false; code: "SESSAO_EXPIRADA" | "FAILED" };

type Write = (
  id: string,
  key: string,
) => ReturnType<typeof sendToQueue> | ReturnType<typeof monitorBatch>;

async function batchWrite(
  input: unknown,
  write: Write,
  layout: boolean,
): Promise<BatchWriteResult> {
  await assertPanelHost();
  const parsed = batchWriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "FAILED" };
  await requireSession();

  const { batchId, idempotencyKey } = parsed.data;
  const result = await write(batchId, idempotencyKey);
  if (result.ok) {
    revalidatePath(panelPath(`/lote/${batchId}`));
    if (layout) revalidatePath(panelPath("/"), "layout");
    const data = result.data as { criados?: number; monitorados?: number };
    return { ok: true, count: data.criados ?? data.monitorados ?? 0 };
  }
  if (result.error.code === "SESSAO_EXPIRADA")
    return { ok: false, code: "SESSAO_EXPIRADA" };
  // Not found, LOTE_EM_ANDAMENTO (C5), a network failure: lote.action.error.
  return { ok: false, code: "FAILED" };
}

/**
 * D-B5 to-queue, from /lote/[batchId]: one case per Atenção + Crítico row,
 * once (the button's key, A-X7, and the backend's per-batch idempotency).
 * Revalidates the batch page and the layout (the shell's Fila count).
 */
export async function sendToQueueAction(
  input: unknown,
): Promise<BatchWriteResult> {
  return batchWrite(input, sendToQueue, true);
}

/** D-B5 monitor, from /lote/[batchId]: weekly monitoring for the successful rows, once. */
export async function monitorBatchAction(
  input: unknown,
): Promise<BatchWriteResult> {
  return batchWrite(input, monitorBatch, false);
}

export type ResumeResult =
  | { ok: true }
  | { ok: false; code: "SEM_SALDO" | "SESSAO_EXPIRADA" | "FAILED" };

/**
 * D-B7, from /lote/[batchId] (AC 22): checks the rows a stopped batch didn't
 * reach. Idempotent (C6). Revalidates the batch page (back to progress) and
 * the layout (the shell's running flag). 402 → SEM_SALDO.
 */
export async function resumeBatchAction(input: unknown): Promise<ResumeResult> {
  await assertPanelHost();
  const parsed = batchRefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "FAILED" };
  await requireSession();

  const { batchId } = parsed.data;
  const result = await resumeBatch(batchId);
  if (result.ok) {
    revalidatePath(panelPath(`/lote/${batchId}`));
    revalidatePath(panelPath("/"), "layout");
    return { ok: true };
  }
  if (result.error.code === "SEM_SALDO")
    return { ok: false, code: "SEM_SALDO" };
  if (result.error.code === "SESSAO_EXPIRADA")
    return { ok: false, code: "SESSAO_EXPIRADA" };
  return { ok: false, code: "FAILED" };
}
