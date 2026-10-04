import { parseCspReports } from "@/lib/csp-report";
import { reportCspViolations } from "@/lib/monitoring";

// The same-origin CSP report collector (T34a): the policy's report-uri and
// report-to point here. Public and unauthenticated by nature, so it reads only
// the two report types, at most 16 KB (counted in bytes, whatever
// Content-Length says; M3-02) and 10 reports, answers 204 whatever it gets (a
// reporter can't learn anything from it), and forwards only scrubbed fields
// (lib/csp-report).
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;
const REPORT_TYPES = ["application/csp-report", "application/reports+json"];

const noContent = () => new Response(null, { status: 204 });
const tooLarge = () => new Response(null, { status: 413 });

/** The body as text, or null once it passes `limit` bytes (the rest is never read). */
async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<string | null> {
  if (body === null) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    bytes += value.byteLength;
    if (bytes > limit) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

export async function POST(request: Request): Promise<Response> {
  const type = request.headers.get("content-type") ?? "";
  if (!REPORT_TYPES.some((report) => type.startsWith(report)))
    return noContent();
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return tooLarge();
  const raw = await readCapped(request.body, MAX_BODY_BYTES);
  if (raw === null) return tooLarge();

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return noContent();
  }
  const violations = parseCspReports(type, body);
  if (violations.length > 0) reportCspViolations(violations);
  return noContent();
}
