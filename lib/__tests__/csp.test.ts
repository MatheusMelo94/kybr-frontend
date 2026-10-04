import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";

const base = { nonce: "abc123", apiOrigin: "https://api.kybr.com.br" };

describe("buildContentSecurityPolicy", () => {
  it("builds the strict production policy", () => {
    expect(
      buildContentSecurityPolicy({
        ...base,
        isDev: false,
        upgradeInsecureRequests: true,
      }),
    ).toBe(
      [
        "default-src 'self'",
        "script-src 'self' 'nonce-abc123' 'strict-dynamic'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self' https://api.kybr.com.br",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests",
        "report-uri /api/csp-report",
        "report-to csp",
      ].join("; "),
    );
  });

  it("T34a / finding 0004: adds only the report directives; every enforcing directive is unchanged", () => {
    const policy = buildContentSecurityPolicy({
      ...base,
      isDev: false,
      upgradeInsecureRequests: true,
    });
    const enforcing = policy
      .split("; ")
      .filter((part) => !part.startsWith("report-"));

    // The policy of record before T34a (M2), verbatim: never relaxed to
    // silence reports.
    expect(enforcing.join("; ")).toBe(
      "default-src 'self'; script-src 'self' 'nonce-abc123' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.kybr.com.br; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests",
    );
  });

  it("allows 'unsafe-eval' only in development (HMR)", () => {
    const dev = buildContentSecurityPolicy({
      ...base,
      isDev: true,
      upgradeInsecureRequests: false,
    });
    const prod = buildContentSecurityPolicy({
      ...base,
      isDev: false,
      upgradeInsecureRequests: false,
    });

    expect(dev).toContain(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' 'unsafe-eval'",
    );
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it("leaves out upgrade-insecure-requests when asked (local http production builds)", () => {
    expect(
      buildContentSecurityPolicy({
        ...base,
        isDev: false,
        upgradeInsecureRequests: false,
      }),
    ).not.toContain("upgrade-insecure-requests");
  });
});

describe("generateNonce", () => {
  it("returns 128 random bits, base64-encoded, different every call", () => {
    const first = generateNonce();
    const second = generateNonce();

    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(second).not.toBe(first);
  });
});
