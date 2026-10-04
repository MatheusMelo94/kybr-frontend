import { scrubUrl } from "./scrub";

// Parses the bodies the CSP report collector receives (T34a): report-uri's
// application/csp-report and the Reporting API's application/reports+json.
// Everything is reduced to five fields, with URLs scrubbed (no case token, no
// query), the directive and disposition allowlisted and the blocked URI capped
// (M3-01), before it reaches monitoring.

export type CspViolation = {
  documentUrl: string;
  /** A scrubbed URL, or a keyword such as "inline", "eval" or "javascript"; at most 256 characters. */
  blocked: string;
  /** A directive name the policy can report, or "other". */
  directive: string;
  /** "enforce", "report" or "other". */
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

/** Longest blocked URI kept (M3-01): it ends up in a log line and a tag. */
export const MAX_BLOCKED_LENGTH = 256;

/**
 * Directive names a browser can report against this policy (lib/csp.ts, plus
 * the -elem/-attr and fetch directives that fall back to default-src). Any
 * other value is the reporter's invention and becomes "other" (M3-01).
 */
const DIRECTIVES = new Set([
  "default-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "img-src",
  "font-src",
  "connect-src",
  "media-src",
  "manifest-src",
  "frame-src",
  "child-src",
  "worker-src",
  "frame-ancestors",
  "base-uri",
  "form-action",
  "object-src",
]);

const DISPOSITIONS = new Set(["enforce", "report"]);

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
  const kept = disposition || "enforce";
  return {
    documentUrl: scrubUrl(documentUrl),
    blocked: scrubBlocked(blocked).slice(0, MAX_BLOCKED_LENGTH),
    directive: DIRECTIVES.has(directive) ? directive : "other",
    disposition: DISPOSITIONS.has(kept) ? kept : "other",
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
