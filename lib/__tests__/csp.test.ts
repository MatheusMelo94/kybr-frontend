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

describe("buildContentSecurityPolicy: the panel (ADR-0008 rule 9, P03.4)", () => {
  const panel = {
    nonce: "abc123",
    isDev: false,
    upgradeInsecureRequests: true,
  };

  function directive(policy: string, name: string): string | undefined {
    return policy
      .split("; ")
      .find((part) => part === name || part.startsWith(`${name} `));
  }

  it("allows connect-src 'self' only: the panel browser never calls the API", () => {
    const policy = buildContentSecurityPolicy(panel);

    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
    expect(policy).not.toContain("challenges.cloudflare.com");
    expect(directive(policy, "frame-src")).toBeUndefined();
  });

  it("adds Turnstile's origin to script-src and frame-src only when asked", () => {
    const policy = buildContentSecurityPolicy({ ...panel, turnstile: true });

    expect(directive(policy, "script-src")).toBe(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic' https://challenges.cloudflare.com",
    );
    expect(directive(policy, "frame-src")).toBe(
      "frame-src https://challenges.cloudflare.com",
    );
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
  });
});

describe("buildContentSecurityPolicy: Lote's worker (ADR-0012 item 7, Security C5)", () => {
  const base = { nonce: "abc", isDev: false, upgradeInsecureRequests: true };

  it("worker: true adds worker-src 'self' (strict-dynamic ignores 'self' in script-src)", () => {
    expect(buildContentSecurityPolicy({ ...base, worker: true })).toContain(
      "worker-src 'self';",
    );
  });

  it("no worker option, no worker-src (the link host)", () => {
    expect(buildContentSecurityPolicy(base)).not.toContain("worker-src");
  });

  it("production never allows blob: workers; development does (Turbopack's bootstrap)", () => {
    expect(
      buildContentSecurityPolicy({ ...base, worker: true }),
    ).not.toMatch(/worker-src[^;]*blob:/);
    expect(
      buildContentSecurityPolicy({ ...base, worker: true, isDev: true }),
    ).toContain("worker-src 'self' blob:;");
  });
});
