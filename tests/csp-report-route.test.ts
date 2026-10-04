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

  // Security M3-02: the cap holds whatever the headers say.
  it("answers 204 to any other content type without reading the body", async () => {
    const request = post(JSON.stringify({ "csp-report": {} }), "text/plain");

    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(request.bodyUsed).toBe(false);
    expect(reportCspViolations).not.toHaveBeenCalled();
  });

  it("counts bytes, not characters: 9 000 'é' (18 000 bytes) is over 16 KB", async () => {
    const response = await POST(
      post(`"${"é".repeat(9_000)}"`, "application/csp-report"),
    );

    expect(response.status).toBe(413);
  });

  it("stops reading a 4 MB body with no Content-Length at 16 KB", async () => {
    let pulled = 0;
    const large = new ReadableStream<Uint8Array>({
      // 4 MB (Vercel's body limit is 4.5 MB): reading it all is the bug.
      pull(controller) {
        pulled += 1;
        if (pulled > 4096) controller.close();
        else controller.enqueue(new Uint8Array(1024).fill(0x20));
      },
    });
    const request = new Request("https://kybr.test/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/reports+json" },
      body: large,
      duplex: "half",
    } as RequestInit);

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(pulled).toBeLessThanOrEqual(20);
    expect(reportCspViolations).not.toHaveBeenCalled();
  });

  it("still reads a body of exactly 16 KB", async () => {
    const report = JSON.stringify({
      "csp-report": {
        "document-uri": "https://kybr.test/v/loja-exemplo",
        "blocked-uri": "inline",
        "effective-directive": "script-src-elem",
      },
    });
    const body = report + " ".repeat(16 * 1024 - report.length);

    const response = await POST(post(body, "application/csp-report"));

    expect(response.status).toBe(204);
    expect(reportCspViolations).toHaveBeenCalledTimes(1);
  });
});
