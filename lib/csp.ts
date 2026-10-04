/** The same-origin CSP report collector (app/api/csp-report/route.ts). */
export const CSP_REPORT_PATH = "/api/csp-report";
/** The Reporting-Endpoints group the policy's report-to names. */
export const CSP_REPORT_GROUP = "csp";

type CspOptions = {
  /** Fresh per request (generateNonce). */
  nonce: string;
  /** Origin of API_PUBLIC_BASE_URL: the browser uploads there (ADR-0004b). */
  apiOrigin: string;
  /** Development only: React Refresh needs eval. */
  isDev: boolean;
  /** Off for loopback hosts, so a local production build over http still loads. */
  upgradeInsecureRequests: boolean;
};

/** The strict, nonce-based policy from frontend-security-conventions.md § Content Security Policy. */
export function buildContentSecurityPolicy({
  nonce,
  apiOrigin,
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
    ],
    // Tailwind and next/font emit inline styles; tighten with nonces when feasible.
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "data:", "blob:"],
    ["font-src", "'self'"],
    ["connect-src", "'self'", apiOrigin],
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
