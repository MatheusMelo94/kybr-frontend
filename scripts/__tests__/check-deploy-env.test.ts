// @vitest-environment node
import { describe, expect, it } from "vitest";

import { checkDeployEnv, parseDotenv } from "../check-deploy-env.mjs";

const PROD_ORIGIN = "https://api.kybr.com.br";

// What vercel@60.1.3 `env pull` writes for a Sensitive variable
// (SENSITIVE_ENV_VALUE_PLACEHOLDER in its dist).
const SENSITIVE = "[SENSITIVE]";

const production = {
  API_BASE_URL: "https://api.kybr.com.br",
  API_PUBLIC_BASE_URL: "https://api.kybr.com.br/",
  API_BFF_KEY: SENSITIVE,
  CLIENT_IP_HEADER: "x-vercel-forwarded-for",
  ENABLE_EXPERIMENTAL_COREPACK: "1",
  VERCEL: "1",
  LINK_HOST: "kybr.com.br",
};

const preview = {
  ...production,
  API_BASE_URL: "https://kybr-mock-api.example.app",
  API_PUBLIC_BASE_URL: "https://kybr-mock-api.example.app",
};

function check(
  env: Record<string, string>,
  target: "preview" | "production",
): string[] {
  return checkDeployEnv(env, { target, productionApiOrigin: PROD_ORIGIN });
}

describe("parseDotenv", () => {
  it("reads the CLI's Sensitive placeholder as the literal [SENSITIVE]", () => {
    expect(parseDotenv('API_BFF_KEY="[SENSITIVE]"\n')).toEqual({
      API_BFF_KEY: SENSITIVE,
    });
  });

  it("reads quoted and bare values and skips comments", () => {
    expect(
      parseDotenv('# Created by Vercel CLI\nA="1"\nB=two\n\nC=""\n'),
    ).toEqual({ A: "1", B: "two", C: "" });
  });
});

describe("checkDeployEnv", () => {
  it("passes a correct Production and Preview environment", () => {
    expect(check(production, "production")).toEqual([]);
    expect(check(preview, "preview")).toEqual([]);
  });

  it("requires Production to point at the production API only (never a mock)", () => {
    expect(check(preview, "production")).toEqual([
      "API_BASE_URL must be https://api.kybr.com.br in production",
      "API_PUBLIC_BASE_URL must be https://api.kybr.com.br in production",
    ]);
  });

  it("refuses a Preview wired to the production API (cross-wiring)", () => {
    expect(check(production, "preview")).toEqual([
      "API_BASE_URL must not be the production API in preview",
      "API_PUBLIC_BASE_URL must not be the production API in preview",
    ]);
  });

  it.each(["preview", "production"] as const)(
    "refuses API_ALLOW_LOOPBACK_HTTP in %s, whatever its value",
    (target) => {
      const env = target === "preview" ? preview : production;
      expect(
        check({ ...env, API_ALLOW_LOOPBACK_HTTP: "false" }, target),
      ).toEqual([
        "API_ALLOW_LOOPBACK_HTTP must not be set in a deployed environment",
      ]);
    },
  );

  it("requires Vercel's client IP header and no trusted hops (F02)", () => {
    expect(
      check(
        {
          ...production,
          CLIENT_IP_HEADER: "x-forwarded-for",
          CLIENT_IP_TRUSTED_HOPS: "1",
        },
        "production",
      ),
    ).toEqual([
      "CLIENT_IP_HEADER must be x-vercel-forwarded-for",
      "CLIENT_IP_TRUSTED_HOPS must not be set",
    ]);
  });

  it("requires https: URLs and reports missing variables", () => {
    expect(
      check(
        {
          CLIENT_IP_HEADER: "x-vercel-forwarded-for",
          API_BASE_URL: "http://mock.example.app",
        },
        "preview",
      ),
    ).toEqual([
      "API_BASE_URL must be an https: URL",
      "API_PUBLIC_BASE_URL is missing",
    ]);
  });

  it("refuses any NEXT_PUBLIC_ variable: it would be inlined into the client bundle", () => {
    expect(check({ ...preview, NEXT_PUBLIC_API_KEY: "x" }, "preview")).toEqual([
      "NEXT_PUBLIC_API_KEY: no NEXT_PUBLIC_* variable is allowed",
    ]);
  });

  it.each(["preview", "production"] as const)(
    "requires API_BFF_KEY to be Sensitive in %s: a readable value means it isn't (DV-03)",
    (target) => {
      const env = target === "preview" ? preview : production;
      expect(
        check({ ...env, API_BFF_KEY: "readable-key-value" }, target),
      ).toEqual(["API_BFF_KEY must be a Sensitive variable in Vercel"]);
    },
  );

  it.each(["preview", "production"] as const)(
    "accepts a Sensitive API_BFF_KEY in %s, whether pulled as [SENSITIVE] or empty",
    (target) => {
      const env = target === "preview" ? preview : production;
      expect(check({ ...env, API_BFF_KEY: SENSITIVE }, target)).toEqual([]);
      expect(check({ ...env, API_BFF_KEY: "" }, target)).toEqual([]);
    },
  );

  it.each([
    "API_BASE_URL",
    "API_PUBLIC_BASE_URL",
    "CLIENT_IP_HEADER",
    "ENABLE_EXPERIMENTAL_COREPACK",
  ])(
    "refuses %s marked Sensitive, with the fix, not a misleading format error",
    (key) => {
      expect(check({ ...preview, [key]: SENSITIVE }, "preview")).toEqual([
        `${key} is marked Sensitive in Vercel; it must be a plain variable so CI can check it (delete it and re-add it without Sensitive)`,
      ]);
    },
  );

  it("never echoes a value", () => {
    const leaky = "https://leaky-value.example.app";
    const problems = check(
      { ...preview, API_BASE_URL: "x" + leaky },
      "production",
    );
    expect(problems.join("\n")).not.toContain("leaky-value");
  });
});

describe("checkDeployEnv: hosts and the panel (ADR-0008 rule 7, T62)", () => {
  const panel = {
    ...production,
    PANEL_HOST: "app.kybr.com.br",
    LEGAL_TERMS_URL: "https://kybr.com.br/termos",
    LEGAL_PRIVACY_URL: "https://kybr.com.br/privacidade",
    LEGAL_TERMS_VERSION: "2026-10-04",
    TURNSTILE_SITE_KEY: "0x4AAAAAAAexampleSiteKey",
    PANEL_DOCUMENTS_ORIGIN: "https://docs.kybr-arquivos.example",
  };

  it("requires LINK_HOST=kybr.com.br in Production (the link 404s without it)", () => {
    const { LINK_HOST: _drop, ...without } = production;
    void _drop;
    expect(check(without, "production")).toEqual([
      "LINK_HOST must be kybr.com.br in production",
    ]);
    expect(
      check({ ...production, LINK_HOST: "www.kybr.com.br" }, "production"),
    ).toEqual(["LINK_HOST must be kybr.com.br in production"]);
  });

  it("doesn't require LINK_HOST on a Preview (its own URLs serve the link)", () => {
    const { LINK_HOST: _drop, ...without } = preview;
    void _drop;
    expect(check(without, "preview")).toEqual([]);
  });

  it("accepts PANEL_HOST unset (the panel is dark) or app.kybr.com.br with its config", () => {
    expect(check(production, "production")).toEqual([]);
    expect(check(panel, "production")).toEqual([]);
  });

  it("refuses any other PANEL_HOST in Production", () => {
    expect(
      check({ ...panel, PANEL_HOST: "kybr-x.vercel.app" }, "production"),
    ).toEqual(["PANEL_HOST must be unset or app.kybr.com.br in production"]);
  });

  it.each([
    "LEGAL_TERMS_URL",
    "LEGAL_PRIVACY_URL",
    "LEGAL_TERMS_VERSION",
    "TURNSTILE_SITE_KEY",
  ])("refuses PANEL_HOST without %s", (name) => {
    expect(check({ ...panel, [name]: "" }, "production")).toEqual([
      `${name} is required when PANEL_HOST is set`,
    ]);
  });

  it("requires https: legal pages", () => {
    expect(
      check(
        { ...panel, LEGAL_TERMS_URL: "http://kybr.com.br/termos" },
        "production",
      ),
    ).toEqual(["LEGAL_TERMS_URL must be an https: URL"]);
  });

  it("refuses Cloudflare's test site keys in Production", () => {
    expect(
      check(
        { ...panel, TURNSTILE_SITE_KEY: "1x00000000000000000000AA" },
        "production",
      ),
    ).toEqual([
      "TURNSTILE_SITE_KEY must not be a Cloudflare test key in production",
    ]);
  });

  it("checks a Preview's PANEL_HOST the same way, test keys allowed", () => {
    expect(
      check(
        {
          ...preview,
          PANEL_HOST: "app-preview.kybr.com.br",
          TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        },
        "preview",
      ),
    ).toEqual([
      "LEGAL_TERMS_URL is required when PANEL_HOST is set",
      "LEGAL_PRIVACY_URL is required when PANEL_HOST is set",
      "LEGAL_TERMS_VERSION is required when PANEL_HOST is set",
    ]);
  });

  it("the new variables are plain (CI must read them)", () => {
    expect(
      check({ ...panel, PANEL_HOST: "[SENSITIVE]" }, "production")[0],
    ).toMatch(/^PANEL_HOST is marked Sensitive/);
  });
});

describe("checkDeployEnv: the documents domain (T116; Security F2, F3; QA Q1)", () => {
  const panel = {
    ...production,
    PANEL_HOST: "app.kybr.com.br",
    LEGAL_TERMS_URL: "https://kybr.com.br/termos",
    LEGAL_PRIVACY_URL: "https://kybr.com.br/privacidade",
    LEGAL_TERMS_VERSION: "2026-10-04",
    TURNSTILE_SITE_KEY: "0x4AAAAAAAexampleSiteKey",
    PANEL_DOCUMENTS_ORIGIN: "https://docs.kybr-arquivos.example",
  };

  it("requires PANEL_DOCUMENTS_ORIGIN with PANEL_HOST in Production", () => {
    const { PANEL_DOCUMENTS_ORIGIN: _drop, ...without } = panel;
    void _drop;
    expect(check(without, "production")).toEqual([
      "PANEL_DOCUMENTS_ORIGIN is required when PANEL_HOST is set in production",
    ]);
  });

  it("doesn't require it while the panel is dark, or on a Preview", () => {
    expect(check(production, "production")).toEqual([]);
    const { PANEL_DOCUMENTS_ORIGIN: _drop, ...without } = panel;
    void _drop;
    expect(
      check(
        {
          ...without,
          ...preview,
          PANEL_HOST: "app-preview.kybr.com.br",
          LEGAL_TERMS_URL: panel.LEGAL_TERMS_URL,
          LEGAL_PRIVACY_URL: panel.LEGAL_PRIVACY_URL,
          LEGAL_TERMS_VERSION: panel.LEGAL_TERMS_VERSION,
          TURNSTILE_SITE_KEY: panel.TURNSTILE_SITE_KEY,
        },
        "preview",
      ),
    ).toEqual([]);
  });

  it.each([
    ["http://docs.kybr-arquivos.example", "must be https:"],
    // Loopback http: is the mock's, allowed only with API_ALLOW_LOOPBACK_HTTP,
    // which no deployed environment may set (QA Q1).
    ["http://localhost:4010", "must be https:"],
    ["https://docs.kybr-arquivos.example/arquivos", "must be an origin"],
    ["https://docs.kybr-arquivos.example?x=1", "must be an origin"],
    ["https://docs.kybr-arquivos.example#x", "must be an origin"],
    ["https://user@docs.kybr-arquivos.example", "must be an origin"],
    ["not a url", "must be an origin"],
    ["https://kybr.com.br", "must not be kybr.com.br"],
    ["https://docs.kybr.com.br", "must not be kybr.com.br"],
    ["https://DOCS.KYBR.COM.BR.", "must not be kybr.com.br"],
  ])("refuses PANEL_DOCUMENTS_ORIGIN=%s (%s)", (value, message) => {
    const problems = check(
      { ...panel, PANEL_DOCUMENTS_ORIGIN: value },
      "production",
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("PANEL_DOCUMENTS_ORIGIN");
    expect(problems[0]).toContain(message);
  });

  it("accepts a trailing slash (still a bare origin) and a port", () => {
    for (const value of [
      "https://docs.kybr-arquivos.example/",
      "https://docs.kybr-arquivos.example:8443",
    ])
      expect(
        check({ ...panel, PANEL_DOCUMENTS_ORIGIN: value }, "production"),
      ).toEqual([]);
  });

  it("compares host:port with PANEL_HOST and LINK_HOST on a Preview", () => {
    const lit = {
      ...preview,
      LINK_HOST: "kybr-link.example.app",
      PANEL_HOST: "kybr-panel.example.app:8443",
      LEGAL_TERMS_URL: panel.LEGAL_TERMS_URL,
      LEGAL_PRIVACY_URL: panel.LEGAL_PRIVACY_URL,
      LEGAL_TERMS_VERSION: panel.LEGAL_TERMS_VERSION,
      TURNSTILE_SITE_KEY: panel.TURNSTILE_SITE_KEY,
    };
    expect(
      check(
        {
          ...lit,
          PANEL_DOCUMENTS_ORIGIN: "https://kybr-panel.example.app:8443",
        },
        "preview",
      ),
    ).toEqual(["PANEL_DOCUMENTS_ORIGIN must not be the panel or link host"]);
    expect(
      check(
        { ...lit, PANEL_DOCUMENTS_ORIGIN: "https://kybr-link.example.app" },
        "preview",
      ),
    ).toEqual(["PANEL_DOCUMENTS_ORIGIN must not be the panel or link host"]);
    // Same hostname, another port: a different origin (Q1b).
    expect(
      check(
        { ...lit, PANEL_DOCUMENTS_ORIGIN: "https://kybr-panel.example.app" },
        "preview",
      ),
    ).toEqual([]);
  });

  it("refuses an unknown PANEL_DOCUMENTS_MODE", () => {
    expect(
      check({ ...panel, PANEL_DOCUMENTS_MODE: "inline" }, "production"),
    ).toEqual(["PANEL_DOCUMENTS_MODE must be redirect or attachment"]);
  });

  it("F3 gate: refuses redirect in Production until the documents-domain check is recorded", () => {
    expect(
      check({ ...panel, PANEL_DOCUMENTS_MODE: "redirect" }, "production"),
    ).toEqual([
      "PANEL_DOCUMENTS_MODE=redirect needs DOCUMENTS_DOMAIN_CHECKED_AT (the F3 check: scripts/check-documents-domain.sh)",
    ]);
    expect(
      check(
        {
          ...panel,
          PANEL_DOCUMENTS_MODE: "redirect",
          DOCUMENTS_DOMAIN_CHECKED_AT: "yesterday",
        },
        "production",
      ),
    ).toEqual([
      "DOCUMENTS_DOMAIN_CHECKED_AT must be the UTC timestamp scripts/check-documents-domain.sh prints",
    ]);
    expect(
      check(
        {
          ...panel,
          PANEL_DOCUMENTS_MODE: "redirect",
          DOCUMENTS_DOMAIN_CHECKED_AT: "2026-10-20T14:03:11Z",
        },
        "production",
      ),
    ).toEqual([]);
  });

  it("F4 fallback: attachment (or unset) needs no gate record; a Preview may redirect", () => {
    expect(
      check({ ...panel, PANEL_DOCUMENTS_MODE: "attachment" }, "production"),
    ).toEqual([]);
    expect(check(panel, "production")).toEqual([]);
    expect(
      check(
        {
          ...preview,
          PANEL_DOCUMENTS_ORIGIN: "https://docs-staging.kybr-arquivos.example",
          PANEL_DOCUMENTS_MODE: "redirect",
        },
        "preview",
      ),
    ).toEqual([]);
  });

  it("the documents variables are plain (CI must read them)", () => {
    for (const key of [
      "PANEL_DOCUMENTS_ORIGIN",
      "PANEL_DOCUMENTS_MODE",
      "DOCUMENTS_DOMAIN_CHECKED_AT",
    ])
      expect(
        check({ ...panel, [key]: "[SENSITIVE]" }, "production")[0],
      ).toMatch(new RegExp(`^${key} is marked Sensitive`));
  });
});
