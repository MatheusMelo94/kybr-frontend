import "server-only";

import { notFound, redirect } from "next/navigation";

import { csvFilename } from "@/features/panel-lote/csv-filename";
import { isBatchId } from "@/features/panel-lote/validation";
import { streamBatchCsv } from "@/lib/api/panel/batches";
import { assertPanelHost } from "@/lib/api/panel/host";
import { requireSession, sessionExpiredUrl } from "@/lib/api/panel/session";
import { reEscapeCsv } from "@/lib/csv-escape";

const NO_STORE = "private, no-store";

/** A backend failure or a file we won't pass on: no detail in the body (P08). */
const badGateway = (): Response =>
  new Response(null, {
    status: 502,
    headers: { "Cache-Control": NO_STORE },
  });

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

  let csv: string;
  try {
    const bytes = await new Response(result.data.body).arrayBuffer();
    csv = reEscapeCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return badGateway();
  }

  // The server's date in São Paulo, never a name.
  const filename = csvFilename(kind, new Date());
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": NO_STORE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
