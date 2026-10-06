/** The same-origin CSP report collector (app/api/csp-report/route.ts). */
export const CSP_REPORT_PATH = "/api/csp-report";
/** The Reporting-Endpoints group the policy's report-to names. */
export const CSP_REPORT_GROUP = "csp";

type CspOptions = {
  /** Fresh per request (generateNonce). */
  nonce: string;
  /** Origin of API_PUBLIC_BASE_URL: the link's browser uploads there
      (ADR-0004b). The panel passes none: its browser never calls the API. */
  apiOrigin?: string;
  /** The panel's auth pages: Cloudflare Turnstile's script and frame (ADR-0009 rule 13). */
  turnstile?: boolean;
  /**
   * The panel host: worker-src 'self' for Lote's parser worker (ADR-0012
   * item 7, Security C5: on every panel document, since a soft navigation
   * keeps the first document's policy). Never on the link host.
   */
  worker?: boolean;
  /** Development only: React Refresh needs eval. */
  isDev: boolean;
  /** Off for loopback hosts, so a local production build over http still loads. */
  upgradeInsecureRequests: boolean;
};

/** Turnstile's origin, allowed on the panel's auth pages only (P03.4). */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * The strict, nonce-based policy from frontend-security-conventions.md
 * § Content Security Policy, per host (ADR-0008 rule 9): the link's allows
 * its API origin in connect-src; the panel's allows 'self' only, plus
 * Turnstile on the auth pages.
 */
export function buildContentSecurityPolicy({
  nonce,
  apiOrigin,
  turnstile = false,
  worker = false,
  isDev,
  upgradeInsecureRequests,
}: CspOptions): string {
  const directives: string[][] = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
      // Ignored by CSP3 browsers under strict-dynamic (the nonce loads it);
      // kept for older ones.
      ...(turnstile ? [TURNSTILE_ORIGIN] : []),
    ],
    // Tailwind and next/font emit inline styles; tighten with nonces when feasible.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'"],
    ["connect-src", "'self'", ...(apiOrigin !== undefined ? [apiOrigin] : [])],
    // Under 'strict-dynamic', 'self' in script-src is ignored, so a
    // same-origin worker needs its own directive. blob: only in development:
    // Turbopack's dev server bootstraps workers from a blob: URL (T71 spike);
    // production never allows it (C5).
    ...(worker
      ? [["worker-src", "'self'", ...(isDev ? ["blob:"] : [])]]
      : []),
    ...(turnstile ? [["frame-src", TURNSTILE_ORIGIN]] : []),
    ["frame-ancestors", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["object-src", "'none'"],
    ...(upgradeInsecureRequests ? [["upgrade-insecure-requests"]] : []),
    // Violations go to the same-origin collector (T34a). report-to names the
    // Reporting-Endpoints group middleware.ts sets; report-uri covers browsers
    // without the Reporting API.
    ["report-uri", CSP_REPORT_PATH],
    ["report-to", CSP_REPORT_GROUP],
  ];
  return directives.map((directive) => directive.join(" ")).join("; ");
}

/** 128 random bits, base64-encoded. Works in the Edge and Node runtimes. */
export function generateNonce(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
  );
}
