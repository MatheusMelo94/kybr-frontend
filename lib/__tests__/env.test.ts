import { afterEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/lib/env-schema";

const SECRET_KEY = "k".repeat(40);

const production = {
  NODE_ENV: "production",
  API_BASE_URL: "https://api.kybr.test",
  API_PUBLIC_BASE_URL: "https://api.kybr.test",
  API_BFF_KEY: SECRET_KEY,
};

const development = {
  NODE_ENV: "development",
  API_BASE_URL: "http://localhost:4010",
  API_PUBLIC_BASE_URL: "http://localhost:4010",
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
  it("parses a complete production environment and defaults the client IP header", () => {
    expect(parseServerEnv(production)).toEqual({
      NODE_ENV: "production",
      API_BASE_URL: "https://api.kybr.test",
      API_PUBLIC_BASE_URL: "https://api.kybr.test",
      API_BFF_KEY: SECRET_KEY,
      CLIENT_IP_HEADER: "x-forwarded-for",
    });
  });

  it("accepts a configured client IP header, normalized to lower case", () => {
    expect(
      parseServerEnv({ ...production, CLIENT_IP_HEADER: "X-Real-IP" })
        .CLIENT_IP_HEADER,
    ).toBe("x-real-ip");
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
