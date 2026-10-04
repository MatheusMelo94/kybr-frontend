// @vitest-environment node
import * as Sentry from "@sentry/nextjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { initMonitoring, reportCspViolations } from "@/lib/monitoring";

// Security M3-03: what a CSP event carries once the real SDK has run
// beforeSend (scrubEvent). No mock of @sentry/nextjs here: Sentry.init runs as
// in production, and only the transport's send is replaced, so nothing leaves
// this machine. Synthetic values only.

// Built at runtime: the SDK sends source context lines with the stack, and a
// literal here would show up in them as source, not as data.
const TOKEN = ["Zk3V9wq2", "LmP0aB7c", "D1eF5gH8"].join("");
const CNPJ = ["12345678", "000195"].join("");
type Transport = NonNullable<
  ReturnType<NonNullable<ReturnType<typeof Sentry.getClient>>["getTransport"]>
>;
type Envelope = Parameters<Transport["send"]>[0];

const sent: Envelope[] = [];

/** The events (not sessions or client reports) in what the transport got. */
function events(): Record<string, unknown>[] {
  return sent.flatMap(([, items]) =>
    items
      .filter(([header]) => header.type === "event")
      .map(([, payload]) => payload as Record<string, unknown>),
  );
}

beforeAll(() => {
  initMonitoring("https://public@o0.ingest.example.test/1");
  const transport = Sentry.getClient()?.getTransport();
  if (transport === undefined) throw new Error("Sentry didn't start");
  vi.spyOn(transport, "send").mockImplementation(async (envelope) => {
    sent.push(envelope);
    return {};
  });
});

afterAll(async () => {
  await Sentry.close(0);
});

describe("a CSP violation, as Sentry sends it", () => {
  it("keeps the blocked URI and the page path as scrubbed tags, and nothing else from the report", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    reportCspViolations([
      {
        documentUrl: `https://kybr.test/v/loja-exemplo/c/${TOKEN}?cnpj=${CNPJ}`,
        blocked: "https://evil.test/x.js?q=1",
        directive: "script-src-elem",
        disposition: "enforce",
        expected: false,
      },
    ]);
    await Sentry.flush(2_000);

    const [event] = events();
    expect(event?.tags).toEqual({
      marker: "CSP_VIOLATION",
      directive: "script-src-elem",
      disposition: "enforce",
      expected: "no",
      blocked: "https://evil.test/x.js",
      document_path: "/v/loja-exemplo/c/[token]",
    });
    expect(JSON.stringify(sent)).not.toContain(TOKEN);
    expect(JSON.stringify(sent)).not.toContain(CNPJ);
  });

  it("cuts a long blocked URI to Sentry's 200-character tag limit", async () => {
    sent.length = 0;
    reportCspViolations([
      {
        documentUrl: "https://kybr.test/v/loja-exemplo",
        blocked: `https://evil.test/${"a".repeat(230)}`,
        directive: "script-src-elem",
        disposition: "enforce",
        expected: false,
      },
    ]);
    await Sentry.flush(2_000);

    const tags = events()[0]?.tags as Record<string, string> | undefined;
    expect(tags?.blocked).toHaveLength(200);
    expect(tags?.document_path).toBe("/v/loja-exemplo");
  });
});
