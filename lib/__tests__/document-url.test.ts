import { describe, expect, it } from "vitest";

import { isAllowedDocumentUrl } from "@/lib/document-url";

const ORIGIN = "https://docs.example.test";
const LOOPBACK = "http://localhost:4010";

describe("isAllowedDocumentUrl (F2)", () => {
  it.each([
    ["the allowlisted origin", `${ORIGIN}/__docs/a?sig=x`],
    ["the origin with its default port spelled out", `${ORIGIN}:443/a`],
    ["an upper-case host (URL lowercases it)", "https://DOCS.example.test/a"],
  ])("allows %s", (_name, url) => {
    expect(
      isAllowedDocumentUrl(url, { origin: ORIGIN, allowLoopbackHttp: false }),
    ).toBe(true);
  });

  it.each([
    ["a look-alike suffix host", "https://docs.example.test.evil.test/a"],
    ["a look-alike subdomain", "https://docs.example.evil.com/a"],
    ["userinfo naming the origin", "https://docs.example.test@evil.test/a"],
    ["userinfo on the origin itself", "https://user:pass@docs.example.test/a"],
    ["a username only", "https://user@docs.example.test/a"],
    ["another port", "https://docs.example.test:8443/a"],
    ["http: on the same host", "http://docs.example.test/a"],
    ["a relative URL", "/__docs/a?sig=x"],
    ["not a URL", "not a url"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:application/pdf;base64,JVBERi0="],
    ["an empty string", ""],
  ])("refuses %s", (_name, url) => {
    expect(
      isAllowedDocumentUrl(url, { origin: ORIGIN, allowLoopbackHttp: true }),
    ).toBe(false);
  });

  it("allows a loopback http: origin only when loopback http is allowed (Q1)", () => {
    const url = `${LOOPBACK}/__docs/a?sig=x`;
    expect(
      isAllowedDocumentUrl(url, { origin: LOOPBACK, allowLoopbackHttp: true }),
    ).toBe(true);
    expect(
      isAllowedDocumentUrl(url, { origin: LOOPBACK, allowLoopbackHttp: false }),
    ).toBe(false);
  });

  it("refuses http: on a non-loopback host even when loopback http is allowed", () => {
    expect(
      isAllowedDocumentUrl("http://docs.example.test/a", {
        origin: "http://docs.example.test",
        allowLoopbackHttp: true,
      }),
    ).toBe(false);
  });

  it("refuses everything when no origin is configured", () => {
    expect(
      isAllowedDocumentUrl(`${ORIGIN}/a`, {
        origin: undefined,
        allowLoopbackHttp: false,
      }),
    ).toBe(false);
  });
});
