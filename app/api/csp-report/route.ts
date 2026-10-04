import { parseCspReports } from "@/lib/csp-report";
import { reportCspViolations } from "@/lib/monitoring";

// The same-origin CSP report collector (T34a): the policy's report-uri and
// report-to point here. Public and unauthenticated by nature, so it reads at
// most 16 KB and 10 reports, answers 204 whatever it gets (a reporter can't
// learn anything from it), and forwards only scrubbed fields (lib/csp-report).
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

export async function POST(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 204 });
  }
  const violations = parseCspReports(
    request.headers.get("content-type") ?? "",
    body,
  );
  if (violations.length > 0) reportCspViolations(violations);
  return new Response(null, { status: 204 });
}
