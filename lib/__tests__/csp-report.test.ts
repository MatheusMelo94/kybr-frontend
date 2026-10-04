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
});
