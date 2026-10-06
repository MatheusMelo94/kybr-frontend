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
  LINK_HOST: "kybr.com.br",
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
      LINK_HOST: "kybr.com.br",
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

  describe("panel hosts and config (ADR-0008, T40)", () => {
    const panel = {
      ...production,
      PANEL_HOST: "app.kybr.com.br",
      LEGAL_TERMS_URL: "https://kybr.com.br/termos",
      LEGAL_PRIVACY_URL: "https://kybr.com.br/privacidade",
      LEGAL_TERMS_VERSION: "2026-10-04",
      TURNSTILE_SITE_KEY: "0x4AAAAAAAexampleKey",
    };

    it("requires LINK_HOST in production: the link 404s without it", () => {
      expect(parseError({ ...production, LINK_HOST: undefined })).toContain(
        "LINK_HOST",
      );
    });

    it("lets a Vercel Preview build go without LINK_HOST: its own URLs are link hosts", () => {
      expect(
        parseServerEnv({
          ...production,
          LINK_HOST: undefined,
          VERCEL_ENV: "preview",
          VERCEL_URL: "kybr-abc123.vercel.app",
        }).LINK_HOST,
      ).toBeUndefined();
    });

    it("doesn't require LINK_HOST outside production", () => {
      expect(parseServerEnv(development).LINK_HOST).toBeUndefined();
    });

    it.each([
      ["kybr.com.br", "kybr.com.br"],
      ["KYBR.com.br", "kybr.com.br"],
      ["localhost:3000", "localhost:3000"],
      ["127.0.0.1:3000", "127.0.0.1:3000"],
    ])("reads LINK_HOST=%s as %s (lowercased, port kept)", (value, host) => {
      expect(
        parseServerEnv({ ...production, LINK_HOST: value }).LINK_HOST,
      ).toBe(host);
    });

    it.each([
      "https://kybr.com.br",
      "kybr.com.br/v",
      "kybr.com.br:",
      "kybr.com.br:abc",
      "user@kybr.com.br",
      "*.kybr.com.br",
      "kybr com br",
    ])("rejects a host that isn't host[:port]: %s", (value) => {
      expect(parseError({ ...production, LINK_HOST: value })).toContain(
        "LINK_HOST",
      );
      expect(parseError({ ...panel, PANEL_HOST: value })).toContain(
        "PANEL_HOST",
      );
    });

    it("leaves the panel off when PANEL_HOST is unset (the release switch)", () => {
      const parsed = parseServerEnv(production);

      expect(parsed.PANEL_HOST).toBeUndefined();
      expect(parsed.LEGAL_TERMS_URL).toBeUndefined();
      expect(parsed.TURNSTILE_SITE_KEY).toBeUndefined();
    });

    it("parses a complete panel configuration", () => {
      expect(
        parseServerEnv({
          ...panel,
          COMMERCIAL_CONTACT_EMAIL: "vendas@kybr.com.br",
        }),
      ).toMatchObject({
        PANEL_HOST: "app.kybr.com.br",
        LEGAL_TERMS_URL: "https://kybr.com.br/termos",
        LEGAL_PRIVACY_URL: "https://kybr.com.br/privacidade",
        LEGAL_TERMS_VERSION: "2026-10-04",
        TURNSTILE_SITE_KEY: "0x4AAAAAAAexampleKey",
        COMMERCIAL_CONTACT_EMAIL: "vendas@kybr.com.br",
      });
    });

    it.each([
      "LEGAL_TERMS_URL",
      "LEGAL_PRIVACY_URL",
      "LEGAL_TERMS_VERSION",
      "TURNSTILE_SITE_KEY",
    ])(
      "refuses to enable the panel in production without %s (P-U3, U-P2)",
      (name) => {
        expect(parseError({ ...panel, [name]: undefined })).toContain(name);
      },
    );

    it.each(["LEGAL_TERMS_URL", "LEGAL_PRIVACY_URL"])(
      "requires an https: %s in production, with loopback allowed like API_PUBLIC_BASE_URL",
      (name) => {
        expect(
          parseError({ ...panel, [name]: "http://kybr.com.br/x" }),
        ).toContain(name);
        expect(
          parseServerEnv({ ...panel, [name]: "http://localhost:3000/x" })[
            name as "LEGAL_TERMS_URL"
          ],
        ).toBe("http://localhost:3000/x");
        expect(
          parseError({ ...panel, [name]: "javascript:alert(1)" }),
        ).toContain(name);
      },
    );

    it("rejects a LEGAL_TERMS_VERSION over 32 characters", () => {
      expect(
        parseError({ ...panel, LEGAL_TERMS_VERSION: "v".repeat(33) }),
      ).toContain("LEGAL_TERMS_VERSION");
    });

    it("rejects a COMMERCIAL_CONTACT_EMAIL that isn't an e-mail", () => {
      expect(
        parseError({ ...panel, COMMERCIAL_CONTACT_EMAIL: "vendas" }),
      ).toContain("COMMERCIAL_CONTACT_EMAIL");
    });

    it("rejects a TURNSTILE_SITE_KEY with characters a site key never has", () => {
      expect(
        parseError({ ...panel, TURNSTILE_SITE_KEY: 'key" onload="x' }),
      ).toContain("TURNSTILE_SITE_KEY");
    });

    it("refuses PANEL_HOST equal to LINK_HOST: one host can't serve both", () => {
      expect(parseError({ ...panel, PANEL_HOST: "kybr.com.br" })).toContain(
        "PANEL_HOST",
      );
    });

    it("reads Vercel's own URLs (VERCEL_ENV, VERCEL_URL, VERCEL_BRANCH_URL)", () => {
      expect(
        parseServerEnv({
          ...production,
          VERCEL_ENV: "preview",
          VERCEL_URL: "Kybr-abc123.vercel.app",
          VERCEL_BRANCH_URL: "kybr-git-feat-x.vercel.app",
        }),
      ).toMatchObject({
        VERCEL_ENV: "preview",
        VERCEL_URL: "kybr-abc123.vercel.app",
        VERCEL_BRANCH_URL: "kybr-git-feat-x.vercel.app",
      });
    });

    it("has no NEXT_PUBLIC_* panel variable: nothing is inlined into the client", () => {
      expect(
        Object.keys(parseServerEnv(panel)).filter((name) =>
          name.startsWith("NEXT_PUBLIC_"),
        ),
      ).toEqual([]);
    });
  });

  describe("the documents origin and mode (D-C6, F2, Q1)", () => {
    const panel = {
      ...production,
      PANEL_HOST: "app.kybr.test",
      LEGAL_TERMS_URL: "https://kybr.com.br/termos",
      LEGAL_PRIVACY_URL: "https://kybr.com.br/privacidade",
      LEGAL_TERMS_VERSION: "2026-10-04",
      TURNSTILE_SITE_KEY: "0x4AAAAAAAexampleKey",
    };

    it("keeps an https: origin as its normalized origin", () => {
      expect(
        parseServerEnv({
          ...panel,
          PANEL_DOCUMENTS_ORIGIN: "https://Docs.Exemplo-Arquivos.test",
        }).PANEL_DOCUMENTS_ORIGIN,
      ).toBe("https://docs.exemplo-arquivos.test");
    });

    it.each([
      ["a path", "https://docs.exemplo.test/arquivos"],
      ["a trailing slash", "https://docs.exemplo.test/"],
      ["a query", "https://docs.exemplo.test?x=1"],
      ["a fragment", "https://docs.exemplo.test#x"],
      ["userinfo", "https://user:pass@docs.exemplo.test"],
      ["not a URL", "docs.exemplo.test"],
      ["another scheme", "ftp://docs.exemplo.test"],
    ])("refuses an origin with %s", (_name, value) => {
      expect(parseError({ ...panel, PANEL_DOCUMENTS_ORIGIN: value })).toContain(
        "PANEL_DOCUMENTS_ORIGIN",
      );
    });

    it.each([
      ["the panel host", "https://app.kybr.test"],
      ["the link host", "https://kybr.com.br"],
      ["kybr.com.br's apex", "https://kybr.com.br:8443"],
      ["a kybr.com.br subdomain", "https://docs.kybr.com.br"],
      ["a deeper kybr.com.br subdomain", "https://a.docs.kybr.com.br"],
    ])(
      "refuses %s, so user content is never same-site (F2)",
      (_name, value) => {
        expect(
          parseError({ ...panel, PANEL_DOCUMENTS_ORIGIN: value }),
        ).toContain("PANEL_DOCUMENTS_ORIGIN");
      },
    );

    it("compares the panel and link hosts with their ports (Q1b)", () => {
      expect(
        parseServerEnv({
          ...panel,
          PANEL_HOST: "localhost:3000",
          LINK_HOST: "localhost:3001",
          API_BASE_URL: "http://localhost:4010",
          API_ALLOW_LOOPBACK_HTTP: "true",
          PANEL_DOCUMENTS_ORIGIN: "http://localhost:4010",
        }).PANEL_DOCUMENTS_ORIGIN,
      ).toBe("http://localhost:4010");
      expect(
        parseError({
          ...panel,
          PANEL_HOST: "localhost:3000",
          API_ALLOW_LOOPBACK_HTTP: "true",
          PANEL_DOCUMENTS_ORIGIN: "http://localhost:3000",
        }),
      ).toContain("PANEL_DOCUMENTS_ORIGIN");
    });

    it("refuses a loopback http: origin in production unless loopback http is allowed (Q1)", () => {
      expect(
        parseError({
          ...panel,
          PANEL_DOCUMENTS_ORIGIN: "http://localhost:4010",
        }),
      ).toContain("PANEL_DOCUMENTS_ORIGIN");
    });

    it("allows a loopback http: origin outside production", () => {
      expect(
        parseServerEnv({
          ...development,
          PANEL_DOCUMENTS_ORIGIN: "http://127.0.0.1:4010",
        }).PANEL_DOCUMENTS_ORIGIN,
      ).toBe("http://127.0.0.1:4010");
    });

    it("never allows a non-loopback http: origin", () => {
      expect(
        parseError({
          ...development,
          API_ALLOW_LOOPBACK_HTTP: "true",
          PANEL_DOCUMENTS_ORIGIN: "http://docs.exemplo.test",
        }),
      ).toContain("PANEL_DOCUMENTS_ORIGIN");
    });

    it("takes redirect or attachment as the mode, nothing else", () => {
      expect(
        parseServerEnv({ ...panel, PANEL_DOCUMENTS_MODE: "redirect" })
          .PANEL_DOCUMENTS_MODE,
      ).toBe("redirect");
      expect(
        parseError({ ...panel, PANEL_DOCUMENTS_MODE: "inline" }),
      ).toContain("PANEL_DOCUMENTS_MODE");
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
