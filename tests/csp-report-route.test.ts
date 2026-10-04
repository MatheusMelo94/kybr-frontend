// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const reportCspViolations = vi.hoisted(() => vi.fn());
vi.mock("@/lib/monitoring", () => ({ reportCspViolations }));

import { POST } from "@/app/api/csp-report/route";

function post(body: string, type: string): Request {
  return new Request("https://kybr.test/api/csp-report", {
    method: "POST",
    headers: { "content-type": type },
    body,
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

// T34a: the same-origin CSP report collector (lead decision; F10).
describe("POST /api/csp-report", () => {
  it("passes the parsed, scrubbed reports to monitoring and answers 204", async () => {
    const response = await POST(
      post(
        JSON.stringify({
          "csp-report": {
            "document-uri":
              "https://kybr.test/v/loja-exemplo/c/Zk3V9wq2LmP0aB7cD1eF5gH8",
            "blocked-uri": "inline",
            "effective-directive": "script-src-elem",
          },
        }),
        "application/csp-report",
      ),
    );

    expect(response.status).toBe(204);
    expect(reportCspViolations).toHaveBeenCalledWith([
      expect.objectContaining({
        documentUrl: "https://kybr.test/v/loja-exemplo/c/[token]",
      }),
    ]);
  });

  it("answers 204 and reports nothing for a body that isn't JSON", async () => {
    const response = await POST(post("{", "application/reports+json"));

    expect(response.status).toBe(204);
    expect(reportCspViolations).not.toHaveBeenCalled();
  });

  it("refuses a body over 16 KB with 413, unread", async () => {
    const response = await POST(
      post("x".repeat(16 * 1024 + 1), "application/csp-report"),
    );

    expect(response.status).toBe(413);
    expect(reportCspViolations).not.toHaveBeenCalled();
  });
});
