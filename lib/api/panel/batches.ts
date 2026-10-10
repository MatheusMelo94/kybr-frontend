import "server-only";

import { z } from "zod";

import type { ApiResult } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";
import { panelRequest, panelStreamRequest } from "@/lib/api/panel/client";
import { CSV_MAX_BYTES } from "@/lib/api/panel/csv-limits";
import { sessionToken } from "@/lib/api/panel/session";
import { apiPaths } from "@/lib/api/path";
import {
  batchHistorySchema,
  batchMonitorSchema,
  batchRowsPageSchema,
  batchSchema,
  batchStartedSchema,
  batchToQueueSchema,
  type Batch,
  type BatchHistory,
  type BatchRowsPage,
} from "@/lib/api/schemas/panel/batches";
import type { BatchLinha, BatchRowStatus } from "@/lib/panel-api-values";

// Lote's data functions (D-B1–D-B7, Pre-Contract). Every call goes through the
// panel client (no-store forced, P06; the bearer from the DAL; the BFF key)
// and answers a result: the page or action decides (notFound, the session
// path, error.tsx). Callers have already passed requireSession() (ADR-0011
// Addendum 1); without a session token nothing is sent.

const noBody = z.unknown().transform(() => undefined);

function sessionExpired(): { ok: false; error: AppError } {
  return { ok: false, error: new AppError({ code: "SESSAO_EXPIRADA" }) };
}

/**
 * A 404 on a batch path is "not found or not yours" (A-X3, PB10), and a 402
 * is SEM_SALDO, whatever the body says; the envelope's disponiveis is kept.
 */
function batchError(error: AppError): AppError {
  const code =
    error.status === 404
      ? "LOTE_NAO_ENCONTRADO"
      : error.status === 402
        ? "SEM_SALDO"
        : error.code;
  if (code === error.code) return error;
  return new AppError({
    code,
    status: error.status,
    requestId: error.requestId,
    disponiveis: error.disponiveis,
  });
}

async function batchRequest<T>(
  request: Omit<Parameters<typeof panelRequest<T>>[0], "sessionToken">,
): Promise<ApiResult<T>> {
  const token = await sessionToken();
  if (token === undefined) return sessionExpired();
  const result = await panelRequest({ ...request, sessionToken: token });
  return result.ok ? result : { ok: false, error: batchError(result.error) };
}

/**
 * D-B2. A progress poll passes its timeout (POLL_TIMEOUT_MS, 4 s) and sends
 * X-Kybr-Poll: 1, so it doesn't slide the session's idle timer (M4-02, C7).
 */
export async function getBatch(
  id: string,
  options: { pollTimeoutMs?: number } = {},
): Promise<ApiResult<Batch>> {
  const path = apiPaths.panel.batches.get(id);
  return batchRequest({
    operation: options.pollTimeoutMs === undefined ? "batch" : "batch-poll",
    path,
    schema: batchSchema,
    ...(options.pollTimeoutMs !== undefined && {
      headers: { "x-kybr-poll": "1" },
      timeoutMs: options.pollTimeoutMs,
    }),
  });
}

/** D-B3: one page of 25, filtered by status, from a cursor (C2). */
export async function listBatchRows(
  id: string,
  filter: { status?: BatchRowStatus; cursor?: string } = {},
): Promise<ApiResult<BatchRowsPage>> {
  const path = apiPaths.panel.batches.rows(id, filter);
  return batchRequest({
    operation: "batch-rows",
    path,
    schema: batchRowsPageSchema,
  });
}

/** D-B6: the newest ten. */
export async function listBatches(): Promise<ApiResult<BatchHistory>> {
  return batchRequest({
    operation: "batch-history",
    path: apiPaths.panel.batches.history(),
    schema: batchHistorySchema,
  });
}

/**
 * D-B1: the action's zod-parsed rows. The Idempotency-Key makes a retry or a
 * double click start one batch (A-X7); the client IP goes along for the
 * audit (CR-P10).
 */
export async function startBatch(
  linhas: BatchLinha[],
  idempotencyKey: string,
): Promise<ApiResult<{ id: string }>> {
  return batchRequest({
    operation: "batch-start",
    path: apiPaths.panel.batches.start(),
    method: "POST",
    body: { linhas },
    headers: { "idempotency-key": idempotencyKey },
    schema: batchStartedSchema,
    forwardClientIp: true,
  });
}

/** D-B5: the Atenção + Crítico rows become Fila cases, once (A-X7, per batch). */
export async function sendToQueue(
  id: string,
  idempotencyKey: string,
): Promise<ApiResult<{ criados: number }>> {
  const path = apiPaths.panel.batches.toQueue(id);
  return batchRequest({
    operation: "batch-to-queue",
    path,
    method: "POST",
    body: {},
    headers: { "idempotency-key": idempotencyKey },
    schema: batchToQueueSchema,
  });
}

/** D-B5: weekly monitoring for every successfully checked row, once. */
export async function monitorBatch(
  id: string,
  idempotencyKey: string,
): Promise<ApiResult<{ monitorados: number }>> {
  const path = apiPaths.panel.batches.monitor(id);
  return batchRequest({
    operation: "batch-monitor",
    path,
    method: "POST",
    body: {},
    headers: { "idempotency-key": idempotencyKey },
    schema: batchMonitorSchema,
  });
}

/** D-B7: 202; idempotent (C6). 402 SEM_SALDO when the rest doesn't fit. */
export async function resumeBatch(id: string): Promise<ApiResult<undefined>> {
  const path = apiPaths.panel.batches.resume(id);
  return batchRequest({
    operation: "batch-resume",
    path,
    method: "POST",
    body: {},
    schema: noBody,
  });
}

/** Errors the stream with UNAVAILABLE once more than `max` bytes went through. */
function capped(
  body: ReadableStream<Uint8Array>,
  max: number,
): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max)
          controller.error(new AppError({ code: "UNAVAILABLE", status: 502 }));
        else controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * D-B4: the backend's CSV as a stream for the download handlers (T86), which
 * re-escape it. Anything but text/csv is refused (INVALID_RESPONSE), and the
 * body is capped at the shared CSV_MAX_BYTES, 4 MiB (O-F5; UNAVAILABLE:
 * declared up front, or as it streams). The handlers answer 502 past it.
 */
export async function streamBatchCsv(
  id: string,
  kind: "result" | "errors",
): Promise<
  ApiResult<{ body: ReadableStream<Uint8Array>; contentType: string }>
> {
  const path = apiPaths.panel.batches.csv(id, kind);
  const token = await sessionToken();
  if (token === undefined) return sessionExpired();
  const result = await panelStreamRequest({
    operation: kind === "result" ? "batch-result-csv" : "batch-errors-csv",
    path,
    accept: "text/csv",
    sessionToken: token,
    // The export is audited with the client IP (CR-P10).
    forwardClientIp: true,
  });
  if (!result.ok) return { ok: false, error: batchError(result.error) };
  const { response } = result;
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const contentType = response.headers.get("content-type") ?? "";
  const fail = (code: "INVALID_RESPONSE" | "UNAVAILABLE") => {
    void response.body?.cancel();
    return {
      ok: false as const,
      error: new AppError({ code, status: response.status, requestId }),
    };
  };
  if (!/^text\/csv(?:;|$)/i.test(contentType) || response.body === null)
    return fail("INVALID_RESPONSE");
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > CSV_MAX_BYTES) return fail("UNAVAILABLE");
  return {
    ok: true,
    status: response.status,
    requestId,
    data: { body: capped(response.body, CSV_MAX_BYTES), contentType },
  };
}
