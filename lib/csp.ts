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
  ];
  return directives.map((directive) => directive.join(" ")).join("; ");
}

/** 128 random bits, base64-encoded. Works in the Edge and Node runtimes. */
export function generateNonce(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
  );
}
