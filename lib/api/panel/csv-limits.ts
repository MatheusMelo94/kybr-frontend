import type { ApiResult } from "@/lib/api/client";
import { AppError } from "@/lib/api/errors";

/**
 * O-F5 (T149): the one size cap for every CSV the panel buffers and passes on
 * (M5's batch downloads, M8's exports). Under Vercel's 4.5 MB function
 * response limit, so an oversized file is a 502 → export.error, never a
 * platform error (M6C-03; ADR-0011 rule 4).
 */
export const CSV_MAX_BYTES = 4 * 1024 * 1024;

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
 * A backend CSV response as a capped stream for a download handler (which
 * buffers and re-escapes it). Anything but text/csv is INVALID_RESPONSE; a
 * declared length over CSV_MAX_BYTES is UNAVAILABLE up front, and a body
 * that grows past it errors with UNAVAILABLE as it streams.
 */
export function cappedCsv(
  response: Response,
): ApiResult<{ body: ReadableStream<Uint8Array>; contentType: string }> {
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
