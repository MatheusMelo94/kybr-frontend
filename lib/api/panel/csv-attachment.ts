import "server-only";

import { reEscapeCsv } from "@/lib/csv-escape";

// The tail every panel CSV download handler shares (M5 T86, M8 T142): the
// capped stream (CSV_MAX_BYTES, O-F5) buffered whole, parsed and escaped
// again (P08: idempotent with the backend, every cell, headers included),
// then a private attachment under a server-dated name. A malformed or
// oversized file is refused whole: 502 with no detail, never a partial
// body. Nothing here logs the body (P16).

const NO_STORE = "private, no-store";

/** A backend failure or a file we won't pass on: no detail in the body (P08). */
export function badGateway(): Response {
  return new Response(null, {
    status: 502,
    headers: { "Cache-Control": NO_STORE },
  });
}

/** A query the handler refuses (zod): no detail, no API call. */
export function badRequest(): Response {
  return new Response(null, {
    status: 400,
    headers: { "Cache-Control": NO_STORE },
  });
}

export async function csvAttachment(
  body: ReadableStream<Uint8Array>,
  filename: string,
): Promise<Response> {
  let csv: string;
  try {
    const bytes = await new Response(body).arrayBuffer();
    csv = reEscapeCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return badGateway();
  }
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
