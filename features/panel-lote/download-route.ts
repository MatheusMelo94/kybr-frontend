import "server-only";

import { notFound, redirect } from "next/navigation";

import { csvFilename } from "@/features/panel-lote/csv-filename";
import { isBatchId } from "@/features/panel-lote/validation";
import { streamBatchCsv } from "@/lib/api/panel/batches";
import { badGateway, csvAttachment } from "@/lib/api/panel/csv-attachment";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession, sessionExpiredUrl } from "@/lib/api/panel/session";

/**
 * The body of the resultado.csv / erros.csv GET handlers (D-B4, T86):
 * host -> id -> session (M4-13: the handler checks it itself) -> the
 * backend's CSV (text/csv only, the shared 4 MiB cap, O-F5) -> parsed and escaped again
 * (P08, idempotent with the backend; Security C9) -> an attachment. A
 * malformed file is refused whole: 502, never a partial body. Nothing here
 * logs the body or its CNPJs (P16).
 */
export async function batchCsvResponse(
  batchId: string,
  kind: "result" | "errors",
): Promise<Response> {
  await assertPanelHost();
  if (!isBatchId(batchId)) notFound();
  await requireSession();

  const result = await streamBatchCsv(batchId, kind);
  if (!result.ok) {
    if (result.error.code === "LOTE_NAO_ENCONTRADO") notFound();
    if (result.error.code === "SESSAO_EXPIRADA")
      redirect(await sessionExpiredUrl());
    return badGateway();
  }

  // The server's date in São Paulo, never a name.
  return csvAttachment(result.data.body, csvFilename(kind, new Date()));
}
