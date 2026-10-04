import { scrubUrl } from "./scrub";

// Parses the bodies the CSP report collector receives (T34a): report-uri's
// application/csp-report and the Reporting API's application/reports+json.
// Everything is reduced to five fields, with URLs scrubbed (no case token, no
// query), before it reaches monitoring.

export type CspViolation = {
  documentUrl: string;
  /** A scrubbed URL, or a keyword such as "inline", "eval" or "javascript". */
  blocked: string;
  directive: string;
  disposition: string;
  /**
   * Finding 0004: a submit before hydration hits the inert `javascript:` form
   * action React renders, and form-action 'self' blocks it on a /v/* page.
   * Expected, so it's tagged and never pages anyone; the CSP is never relaxed.
   */
  expected: boolean;
};

/** At most this many reports are taken from one request. */
const MAX_REPORTS = 10;

type Raw = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A URL is scrubbed; a keyword ("inline", "javascript") stays as is. */
function scrubBlocked(value: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? scrubUrl(value) : value;
}

function isLinkPage(documentUrl: string): boolean {
  try {
    return /^\/v\/[^/]+(\/|$)/.test(new URL(documentUrl).pathname);
  } catch {
    return false;
  }
}

function violation(
  documentUrl: string,
  blocked: string,
  directive: string,
  disposition: string,
): CspViolation {
  const expected =
    directive === "form-action" &&
    /^javascript(:|$)/.test(blocked) &&
    isLinkPage(documentUrl);
  return {
    documentUrl: scrubUrl(documentUrl),
    blocked: scrubBlocked(blocked),
    directive,
    disposition: disposition || "enforce",
    expected,
  };
}

/** The violations in a collector request body (already JSON-parsed). */
export function parseCspReports(
  contentType: string,
  body: unknown,
): CspViolation[] {
  if (contentType.startsWith("application/csp-report")) {
    const report = isRecord(body) ? body["csp-report"] : undefined;
    if (!isRecord(report)) return [];
    return [
      violation(
        text(report["document-uri"]),
        text(report["blocked-uri"]),
        text(report["effective-directive"]) ||
          text(report["violated-directive"]),
        text(report.disposition),
      ),
    ];
  }
  if (contentType.startsWith("application/reports+json")) {
    if (!Array.isArray(body)) return [];
    return body
      .filter(
        (entry): entry is { body: Raw } =>
          isRecord(entry) &&
          entry.type === "csp-violation" &&
          isRecord(entry.body),
      )
      .slice(0, MAX_REPORTS)
      .map(({ body: report }) =>
        violation(
          text(report.documentURL),
          text(report.blockedURL),
          text(report.effectiveDirective),
          text(report.disposition),
        ),
      );
  }
  return [];
}
