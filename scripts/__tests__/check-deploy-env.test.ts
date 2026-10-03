// @vitest-environment node
import { describe, expect, it } from "vitest";

import { checkDeployEnv, parseDotenv } from "../check-deploy-env.mjs";

const PROD_ORIGIN = "https://api.kybr.com.br";

const production = {
  API_BASE_URL: "https://api.kybr.com.br",
  API_PUBLIC_BASE_URL: "https://api.kybr.com.br/",
  API_BFF_KEY: "",
  CLIENT_IP_HEADER: "x-vercel-forwarded-for",
  VERCEL: "1",
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

  it("never echoes a value", () => {
    const leaky = "https://leaky-value.example.app";
    const problems = check(
      { ...preview, API_BASE_URL: "x" + leaky },
      "production",
    );
    expect(problems.join("\n")).not.toContain("leaky-value");
  });
});
