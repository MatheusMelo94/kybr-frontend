import { afterEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/lib/env-schema";

const SECRET_KEY = "k".repeat(40);

const production = {
  NODE_ENV: "production",
  API_BASE_URL: "https://api.kybr.test",
  API_PUBLIC_BASE_URL: "https://api.kybr.test",
  API_BFF_KEY: SECRET_KEY,
  CLIENT_IP_HEADER: "x-forwarded-for",
  CLIENT_IP_TRUSTED_HOPS: "1",
};

const development = {
  NODE_ENV: "development",
  API_BASE_URL: "http://localhost:4010",
  API_PUBLIC_BASE_URL: "http://localhost:4010",
  CLIENT_IP_HEADER: "x-forwarded-for",
  CLIENT_IP_TRUSTED_HOPS: "1",
};

function parseError(source: Record<string, string | undefined>): string {
  try {
    parseServerEnv(source);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected parseServerEnv to throw");
}

describe("parseServerEnv", () => {
  it("parses a complete production environment", () => {
    expect(parseServerEnv(production)).toEqual({
      NODE_ENV: "production",
      API_BASE_URL: "https://api.kybr.test",
      API_PUBLIC_BASE_URL: "https://api.kybr.test",
      API_BFF_KEY: SECRET_KEY,
      CLIENT_IP_HEADER: "x-forwarded-for",
      CLIENT_IP_TRUSTED_HOPS: 1,
    });
  });

  it("accepts a single-value client IP header, normalized to lower case, without trusted hops", () => {
    const parsed = parseServerEnv({
      ...production,
      CLIENT_IP_HEADER: "X-Real-IP",
      CLIENT_IP_TRUSTED_HOPS: undefined,
    });

    expect(parsed.CLIENT_IP_HEADER).toBe("x-real-ip");
    expect(parsed.CLIENT_IP_TRUSTED_HOPS).toBeUndefined();
  });

  it("ignores trusted hops for a single-value header", () => {
    expect(
      parseServerEnv({ ...production, CLIENT_IP_HEADER: "cf-connecting-ip" })
        .CLIENT_IP_TRUSTED_HOPS,
    ).toBeUndefined();
  });

  it.each([development, production])(
    "requires CLIENT_IP_HEADER, with no default (F02)",
    (source) => {
      expect(parseError({ ...source, CLIENT_IP_HEADER: undefined })).toContain(
        "CLIENT_IP_HEADER",
      );
    },
  );

  it("requires CLIENT_IP_TRUSTED_HOPS for the list-valued x-forwarded-for", () => {
    expect(
      parseError({ ...production, CLIENT_IP_TRUSTED_HOPS: undefined }),
    ).toContain("CLIENT_IP_TRUSTED_HOPS");
  });

  it.each(["0", "-1", "1.5", "abc", "11"])(
    "rejects CLIENT_IP_TRUSTED_HOPS=%s (a whole number from 1 to 10)",
    (hops) => {
      expect(
        parseError({ ...production, CLIENT_IP_TRUSTED_HOPS: hops }),
      ).toContain("CLIENT_IP_TRUSTED_HOPS");
    },
  );

  it("reads CLIENT_IP_TRUSTED_HOPS as a number", () => {
    expect(
      parseServerEnv({ ...production, CLIENT_IP_TRUSTED_HOPS: "2" })
        .CLIENT_IP_TRUSTED_HOPS,
    ).toBe(2);
  });

  it.each(["API_BASE_URL", "API_PUBLIC_BASE_URL"])(
    "rejects a missing %s",
    (name) => {
      expect(parseError({ ...production, [name]: undefined })).toContain(name);
    },
  );

  it("treats an empty value as missing", () => {
    expect(parseError({ ...production, API_BASE_URL: "" })).toContain(
      "API_BASE_URL",
    );
  });

  it.each(["not a url", "javascript:alert(1)", "ftp://api.kybr.test"])(
    "rejects a base URL that is not http(s): %s",
    (value) => {
      expect(parseError({ ...production, API_BASE_URL: value })).toContain(
        "API_BASE_URL",
      );
    },
  );

  it("T34a / QA G12: SENTRY_DSN is optional in every build, production included", () => {
    expect(parseServerEnv(production).SENTRY_DSN).toBeUndefined();
    expect(
      parseServerEnv({
        ...production,
        SENTRY_DSN: "https://public@o0.ingest.sentry.test/1",
      }).SENTRY_DSN,
    ).toBe("https://public@o0.ingest.sentry.test/1");
  });

  it("T34a: rejects a SENTRY_DSN that isn't an https: URL, without echoing it", () => {
    const message = parseError({
      ...production,
      SENTRY_DSN: "http://secret-public-key@sentry.test/1",
    });

    expect(message).toContain("SENTRY_DSN");
    expect(message).not.toContain("secret-public-key");
  });

  it("requires API_BFF_KEY in production", () => {
    expect(parseError({ ...production, API_BFF_KEY: undefined })).toContain(
      "API_BFF_KEY",
    );
  });

  it("rejects an API_BFF_KEY shorter than 32 characters", () => {
    expect(
      parseError({ ...development, API_BFF_KEY: "k".repeat(31) }),
    ).toContain("API_BFF_KEY");
  });

  it("requires an https: API_PUBLIC_BASE_URL in production", () => {
    expect(
      parseError({
        ...production,
        API_PUBLIC_BASE_URL: "http://api.kybr.test",
      }),
    ).toContain("API_PUBLIC_BASE_URL");
  });

  it("requires an https: API_BASE_URL in production: the BFF key and PII travel on it (F08)", () => {
    expect(
      parseError({ ...production, API_BASE_URL: "http://api.kybr.test" }),
    ).toContain("API_BASE_URL");
  });

  it("refuses a loopback http: API_BASE_URL in production unless explicitly allowed", () => {
    expect(
      parseError({ ...production, API_BASE_URL: "http://localhost:4010" }),
    ).toContain("API_BASE_URL");
    expect(
      parseServerEnv({
        ...production,
        API_BASE_URL: "http://localhost:4010",
        API_ALLOW_LOOPBACK_HTTP: "true",
      }).API_BASE_URL,
    ).toBe("http://localhost:4010");
  });

  it("never lets the loopback flag allow a non-loopback http: API_BASE_URL", () => {
    expect(
      parseError({
        ...production,
        API_BASE_URL: "http://api.kybr.test",
        API_ALLOW_LOOPBACK_HTTP: "true",
      }),
    ).toContain("API_BASE_URL");
  });

  it("allows a loopback http: API_PUBLIC_BASE_URL in production, for local production builds", () => {
    expect(
      parseServerEnv({
        ...production,
        API_PUBLIC_BASE_URL: "http://localhost:4010",
      }).API_PUBLIC_BASE_URL,
    ).toBe("http://localhost:4010");
  });

  it("does not require API_BFF_KEY or https: outside production", () => {
    const parsed = parseServerEnv(development);

    expect(parsed.API_PUBLIC_BASE_URL).toBe("http://localhost:4010");
    expect(parsed.API_BFF_KEY).toBeUndefined();
  });

  it("rejects a client IP header that is not a header name", () => {
    expect(
      parseError({ ...production, CLIENT_IP_HEADER: "x forwarded" }),
    ).toContain("CLIENT_IP_HEADER");
  });

  describe("on Vercel (VERCEL=1, threat model F02)", () => {
    const vercel = {
      ...production,
      VERCEL: "1",
      CLIENT_IP_HEADER: "x-vercel-forwarded-for",
      CLIENT_IP_TRUSTED_HOPS: undefined,
    };

    it("accepts Vercel's own client IP header as a single value", () => {
      const parsed = parseServerEnv(vercel);

      expect(parsed.CLIENT_IP_HEADER).toBe("x-vercel-forwarded-for");
      expect(parsed.CLIENT_IP_TRUSTED_HOPS).toBeUndefined();
    });

    it.each(["x-forwarded-for", "x-real-ip", "cf-connecting-ip"])(
      "rejects CLIENT_IP_HEADER=%s: a proxy in front of Vercel may rewrite it",
      (header) => {
        expect(
          parseError({
            ...vercel,
            CLIENT_IP_HEADER: header,
            CLIENT_IP_TRUSTED_HOPS: "1",
          }),
        ).toContain("CLIENT_IP_HEADER");
      },
    );

    it("does not apply off Vercel", () => {
      expect(
        parseServerEnv({ ...production, VERCEL: undefined }).CLIENT_IP_HEADER,
      ).toBe("x-forwarded-for");
    });
  });

  it("never echoes a variable's value in the error", () => {
    const leaky = "s3cr3t-value-that-must-not-leak";
    expect(parseError({ ...production, API_BFF_KEY: leaky })).not.toContain(
      leaky,
    );
  });
});

describe("env", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is parsed from process.env", async () => {
    vi.stubEnv("API_BASE_URL", "http://localhost:4010");
    vi.stubEnv("API_PUBLIC_BASE_URL", "http://localhost:4010");
    vi.stubEnv("API_BFF_KEY", SECRET_KEY);
    vi.stubEnv("CLIENT_IP_HEADER", "x-real-ip");
    vi.stubEnv("CLIENT_IP_TRUSTED_HOPS", "");

    const { env } = await import("@/lib/env");

    expect(env).toMatchObject({
      API_BASE_URL: "http://localhost:4010",
      API_BFF_KEY: SECRET_KEY,
      CLIENT_IP_HEADER: "x-real-ip",
    });
  });

  it("fails at import when a required variable is missing", async () => {
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("API_PUBLIC_BASE_URL", "http://localhost:4010");

    await expect(import("@/lib/env")).rejects.toThrow("API_BASE_URL");
  });
});
