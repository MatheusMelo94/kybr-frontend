// @vitest-environment node
import type { ErrorEvent } from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureMessage: vi.fn(),
}));
vi.mock("@sentry/nextjs", () => sentry);

import {
  initMonitoring,
  reportCspViolations,
  reportMarker,
  scrubEvent,
  scrubUrl,
} from "@/lib/monitoring";

// T34a (threat model F10; SEC § Logging & Monitoring): server-side Sentry,
// scrubbed. Synthetic values only.
const TOKEN = "Zk3V9wq2LmP0aB7cD1eF5gH8";
const CNPJ = "12345678000195";
const NAME = "Maria Exemplo Silva";
const EMAIL = "maria.exemplo@empresa-exemplo.test";
const BFF_KEY = "k".repeat(40);
const IP = "203.0.113.7";

afterEach(() => {
  vi.clearAllMocks();
});

describe("scrubUrl", () => {
  it("replaces the case token and drops the query and fragment", () => {
    expect(
      scrubUrl(`https://kybr.test/v/loja-exemplo/c/${TOKEN}?ref=x#y`),
    ).toBe("https://kybr.test/v/loja-exemplo/c/[token]");
    expect(scrubUrl(`/v/loja-exemplo/c/${TOKEN}/`)).toBe(
      "/v/loja-exemplo/c/[token]/",
    );
    expect(scrubUrl("/v/loja-exemplo?ext_id=SELLER-42")).toBe(
      "/v/loja-exemplo",
    );
  });
});

describe("scrubEvent", () => {
  it("a test event built from a failing action keeps no CNPJ, name, e-mail, token, key or IP", () => {
    const event = {
      message: `Action failed for /v/loja-exemplo/c/${TOKEN} ${CNPJ} ${EMAIL}`,
      transaction: `POST /v/loja-exemplo/c/${TOKEN}`,
      request: {
        url: `https://kybr.test/v/loja-exemplo/c/${TOKEN}?ref=onboarding`,
        method: "POST",
        data: JSON.stringify([
          { slug: "loja-exemplo", token: TOKEN, email: EMAIL },
        ]),
        query_string: `cnpj=${CNPJ}`,
        cookies: { session: "abc" },
        headers: {
          "x-kybr-bff-key": BFF_KEY,
          "x-forwarded-for": IP,
          "next-action": "abc",
        },
        env: { REMOTE_ADDR: IP },
      },
      user: { ip_address: IP },
      exception: {
        values: [
          {
            type: "Error",
            value: `lookup ${CNPJ} for ${EMAIL} at /v/loja-exemplo/c/${TOKEN}`,
          },
        ],
      },
      breadcrumbs: [
        {
          category: "fetch",
          data: { url: `https://api.kybr.test/public/v/x/lookup?cnpj=${CNPJ}` },
        },
        { category: "console", message: `${NAME} ${EMAIL}` },
      ],
      extra: { args: [NAME, CNPJ] },
      contexts: { action: { responsavel: NAME } },
    } as unknown as ErrorEvent;

    const scrubbed = JSON.stringify(scrubEvent(event));

    for (const secret of [TOKEN, CNPJ, NAME, EMAIL, BFF_KEY, IP])
      expect(scrubbed).not.toContain(secret);
    expect(scrubbed).toContain("/v/loja-exemplo/c/[token]");
  });
});

describe("initMonitoring", () => {
  it("does nothing without a DSN (optional in every build, QA G12)", () => {
    initMonitoring(undefined);

    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("starts server-side Sentry collecting no request or user data (v11 dataCollection, the sendDefaultPii: false of record), with the scrubber", () => {
    initMonitoring("https://public@o0.ingest.sentry.test/1");

    expect(sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@o0.ingest.sentry.test/1",
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          stackFrameVariables: false,
        },
        beforeSend: scrubEvent,
        tracesSampleRate: 0,
      }),
    );
  });
});

describe("reportMarker", () => {
  it("logs a shape-only marker and sends it as an error tagged with the marker", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    reportMarker("REDIRECT_REFUSED", { operation: "getPublicLink" });

    expect(log).toHaveBeenCalledWith("[kybr] REDIRECT_REFUSED", {
      operation: "getPublicLink",
    });
    expect(sentry.captureMessage).toHaveBeenCalledWith("REDIRECT_REFUSED", {
      level: "error",
      tags: { marker: "REDIRECT_REFUSED", operation: "getPublicLink" },
    });
    log.mockRestore();
  });
});

describe("reportCspViolations", () => {
  it("sends each violation scrubbed, as a warning", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});

    reportCspViolations([
      {
        documentUrl: `https://kybr.test/v/loja-exemplo/c/${TOKEN}`,
        blocked: "https://evil.test/x.js?cnpj=1",
        directive: "script-src-elem",
        disposition: "enforce",
        expected: false,
      },
    ]);

    expect(sentry.captureMessage).toHaveBeenCalledWith("csp-violation", {
      level: "warning",
      tags: {
        marker: "CSP_VIOLATION",
        directive: "script-src-elem",
        disposition: "enforce",
        expected: "no",
      },
      extra: {
        documentUrl: "https://kybr.test/v/loja-exemplo/c/[token]",
        blocked: "https://evil.test/x.js",
      },
    });
    log.mockRestore();
  });

  it("finding 0004: a pre-hydration submit's expected violation is tagged and sent as info, so it never pages", () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});

    reportCspViolations([
      {
        documentUrl: "https://kybr.test/v/loja-exemplo",
        blocked: "javascript",
        directive: "form-action",
        disposition: "enforce",
        expected: true,
      },
    ]);

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "csp-violation",
      expect.objectContaining({
        level: "info",
        tags: expect.objectContaining({
          expected: "pre-hydration-submit",
        }),
      }),
    );
    log.mockRestore();
  });

  // Security M3-01: the collector can't burn the Sentry quota or flood the logs.
  describe("M3-01: a per-instance budget", () => {
    const violation = (blocked: string) => ({
      documentUrl: "https://kybr.test/v/loja-exemplo",
      blocked,
      directive: "script-src-elem",
      disposition: "enforce",
      expected: false,
    });
    let minute = 0;
    beforeEach(() => {
      vi.useFakeTimers();
      // A fresh window for every test: an hour apart.
      minute += 60;
      vi.setSystemTime(minute * 60_000);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("sends at most 30 events a minute, then nothing until the next minute", () => {
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});

      for (let i = 0; i < 10; i++)
        reportCspViolations(
          Array.from({ length: 10 }, (_, j) =>
            violation(`https://evil.test/${i}-${j}.js`),
          ),
        );
      expect(sentry.captureMessage).toHaveBeenCalledTimes(30);

      vi.advanceTimersByTime(60_000);
      reportCspViolations([violation("https://evil.test/next.js")]);
      expect(sentry.captureMessage).toHaveBeenCalledTimes(31);
      log.mockRestore();
    });

    it("sends the same directive and blocked URI once a minute", () => {
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});

      reportCspViolations([
        violation("https://evil.test/a.js"),
        violation("https://evil.test/a.js"),
      ]);
      reportCspViolations([violation("https://evil.test/a.js")]);

      expect(sentry.captureMessage).toHaveBeenCalledTimes(1);
      log.mockRestore();
    });

    it("logs shape only (no blocked URI), and one line for what the budget drops", () => {
      const log = vi.spyOn(console, "warn").mockImplementation(() => {});

      reportCspViolations(
        Array.from({ length: 40 }, (_, i) =>
          violation(`https://evil.test/${i}.js`),
        ),
      );

      expect(log).toHaveBeenCalledTimes(31);
      expect(JSON.stringify(log.mock.calls)).not.toContain("evil.test");
      expect(log).toHaveBeenLastCalledWith("[kybr] CSP_VIOLATION_BUDGET", {
        perMinute: "30",
      });
      log.mockRestore();
    });
  });
});
