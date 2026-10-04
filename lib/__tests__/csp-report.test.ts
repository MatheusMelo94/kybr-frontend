// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseCspReports } from "@/lib/csp-report";

// T34a: the same-origin collector's parser. Both formats: report-uri
// (application/csp-report) and the Reporting API (application/reports+json).
const TOKEN = "Zk3V9wq2LmP0aB7cD1eF5gH8";

describe("parseCspReports", () => {
  it("reads a report-uri body, scrubbing the token and any query", () => {
    expect(
      parseCspReports("application/csp-report", {
        "csp-report": {
          "document-uri": `https://kybr.test/v/loja-exemplo/c/${TOKEN}?a=1`,
          "blocked-uri": "https://evil.test/x.js?q=1",
          "effective-directive": "script-src-elem",
          "violated-directive": "script-src-elem",
          disposition: "enforce",
        },
      }),
    ).toEqual([
      {
        documentUrl: "https://kybr.test/v/loja-exemplo/c/[token]",
        blocked: "https://evil.test/x.js",
        directive: "script-src-elem",
        disposition: "enforce",
        expected: false,
      },
    ]);
  });

  it("reads Reporting API batches, keeping csp-violation reports only (at most 10)", () => {
    const one = {
      type: "csp-violation",
      body: {
        documentURL: `https://kybr.test/v/loja-exemplo/c/${TOKEN}`,
        blockedURL: "inline",
        effectiveDirective: "style-src-attr",
        disposition: "enforce",
      },
    };
    const reports = parseCspReports("application/reports+json", [
      { type: "deprecation", body: {} },
      ...Array.from({ length: 12 }, () => one),
    ]);

    expect(reports).toHaveLength(10);
    expect(reports[0]).toEqual({
      documentUrl: "https://kybr.test/v/loja-exemplo/c/[token]",
      blocked: "inline",
      directive: "style-src-attr",
      disposition: "enforce",
      expected: false,
    });
  });

  it("finding 0004: marks the pre-hydration javascript: form submit on a /v/* page as expected", () => {
    const [report] = parseCspReports("application/csp-report", {
      "csp-report": {
        "document-uri": "https://kybr.test/v/loja-exemplo?ref=x",
        "blocked-uri": "javascript",
        "effective-directive": "form-action",
        disposition: "enforce",
      },
    });

    expect(report?.expected).toBe(true);
  });

  it("does not mark the same block outside /v/*, or another directive, as expected", () => {
    const outside = parseCspReports("application/csp-report", {
      "csp-report": {
        "document-uri": "https://kybr.test/painel",
        "blocked-uri": "javascript",
        "effective-directive": "form-action",
      },
    });
    const other = parseCspReports("application/csp-report", {
      "csp-report": {
        "document-uri": "https://kybr.test/v/loja-exemplo",
        "blocked-uri": "javascript",
        "effective-directive": "script-src-elem",
      },
    });

    expect(outside[0]?.expected).toBe(false);
    expect(other[0]?.expected).toBe(false);
  });

  it("returns nothing for a body that isn't a report, or another content type", () => {
    expect(parseCspReports("application/csp-report", { x: 1 })).toEqual([]);
    expect(parseCspReports("application/csp-report", "nope")).toEqual([]);
    expect(parseCspReports("text/plain", { "csp-report": {} })).toEqual([]);
  });

  // Security M3-01: nothing an attacker types reaches a tag or a log unbounded.
  describe("M3-01: attacker-controlled fields are bounded", () => {
    const report = (fields: Record<string, string>) =>
      parseCspReports("application/csp-report", {
        "csp-report": {
          "document-uri": "https://kybr.test/v/loja-exemplo",
          "blocked-uri": "https://evil.test/x.js",
          "effective-directive": "script-src-elem",
          ...fields,
        },
      })[0];

    it.each([
      "script-src",
      "script-src-elem",
      "script-src-attr",
      "style-src-elem",
      "style-src-attr",
      "img-src",
      "font-src",
      "connect-src",
      "frame-src",
      "worker-src",
      "frame-ancestors",
      "base-uri",
      "form-action",
      "object-src",
      "default-src",
    ])("keeps the directive name %s", (directive) => {
      expect(report({ "effective-directive": directive })?.directive).toBe(
        directive,
      );
    });

    it("maps any other directive to other", () => {
      expect(
        report({ "effective-directive": "script-src-elem; evil=1" })?.directive,
      ).toBe("other");
      expect(
        report({ "effective-directive": "x".repeat(5_000) })?.directive,
      ).toBe("other");
      expect(
        report({ "effective-directive": "SCRIPT-SRC-ELEM" })?.directive,
      ).toBe("other");
    });

    it("keeps enforce and report as the disposition, and maps anything else to other", () => {
      expect(report({ disposition: "enforce" })?.disposition).toBe("enforce");
      expect(report({ disposition: "report" })?.disposition).toBe("report");
      expect(report({ disposition: "" })?.disposition).toBe("enforce");
      expect(report({ disposition: "critical\nfake" })?.disposition).toBe(
        "other",
      );
    });

    it("caps the blocked URI at 256 characters", () => {
      const long = `https://evil.test/${"a".repeat(1_000)}.js`;
      expect(report({ "blocked-uri": long })?.blocked).toHaveLength(256);
      expect(
        report({ "blocked-uri": "z".repeat(1_000) })?.blocked,
      ).toHaveLength(256);
    });
  });
});
