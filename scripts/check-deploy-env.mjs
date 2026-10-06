#!/usr/bin/env node
// Deploy env check: fails when a Vercel environment is wired wrong. The deploy
// workflows run it on the file `vercel env pull` writes, before deploying.
//
//   node scripts/check-deploy-env.mjs <env-file> <preview|production>
//
// Rules (frontend-devops-conventions.md § Environment Model; threat model F02,
// F08, F15; plan § 14):
// - Production points at PRODUCTION_API_ORIGIN only, never a mock. Preview
//   never points at it (cross-wiring is a NO-GO).
// - The API URLs are https:.
// - API_ALLOW_LOOPBACK_HTTP is never set in a deployed environment.
// - CLIENT_IP_HEADER is x-vercel-forwarded-for, with no trusted hops.
// - No NEXT_PUBLIC_* variable: it would be inlined into the client bundle.
// - API_BFF_KEY is Sensitive: `vercel env pull` can't read a Sensitive value
//   back, so a readable value means the toggle was missed (Security DV-03).
//   Its presence isn't checked: the build fails without it (lib/env-schema.ts).
// - The plain variables are not Sensitive: CI must read them to check them.
// - Hosts (ADR-0008 rule 7): Production LINK_HOST=kybr.com.br; PANEL_HOST is
//   unset (the panel is dark) or app.kybr.com.br in Production. With
//   PANEL_HOST set (any environment), the legal pages (https:), the terms
//   version and the Turnstile site key are required; Production refuses
//   Cloudflare's test keys.
// - Documents (T116; Security F2, F3; QA Q1): with PANEL_HOST set in
//   Production, PANEL_DOCUMENTS_ORIGIN is required. Wherever it's set it is a
//   bare https: origin (never loopback http:, which only API_ALLOW_LOOPBACK_HTTP
//   allows), not the panel or link host (host:port), and not under
//   kybr.com.br (CR-P7: a separate registrable domain).
//   PANEL_DOCUMENTS_MODE=redirect ships to Production only once the F3 check
//   (scripts/check-documents-domain.sh) has passed and its timestamp is
//   recorded in DOCUMENTS_DOMAIN_CHECKED_AT; until then the F4 attachment
//   fallback ships.
//
// It names variables, never their values.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VERCEL_CLIENT_IP_HEADER = "x-vercel-forwarded-for";
const PRODUCTION_LINK_HOST = "kybr.com.br";
const PRODUCTION_PANEL_HOST = "app.kybr.com.br";
const PANEL_REQUIRED = [
  "LEGAL_TERMS_URL",
  "LEGAL_PRIVACY_URL",
  "LEGAL_TERMS_VERSION",
  "TURNSTILE_SITE_KEY",
];
const LEGAL_URL_KEYS = ["LEGAL_TERMS_URL", "LEGAL_PRIVACY_URL"];
// Cloudflare's documented test site keys (always pass / block / interactive).
const TURNSTILE_TEST_KEY = /^[123]x0{20}[A-Z]{2}$/;
const API_URL_KEYS = ["API_BASE_URL", "API_PUBLIC_BASE_URL"];
const SITE_DOMAIN = "kybr.com.br";
const DOCUMENTS_MODES = ["redirect", "attachment"];
// What scripts/check-documents-domain.sh prints on a pass.
const CHECKED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// What `vercel env pull` writes in place of a Sensitive value: vercel@60.1.3
// defines SENSITIVE_ENV_VALUE_PLACEHOLDER = "[SENSITIVE]"
// (dist/chunks/chunk-7CTHRXTG.js) and logs 'Wrote "[SENSITIVE]" as
// placeholders'. Other CLI versions may write an empty value instead.
const SENSITIVE_PLACEHOLDER = "[SENSITIVE]";

// Non-secret config that must stay readable, so CI can check it.
const PLAIN_KEYS = [
  ...API_URL_KEYS,
  "CLIENT_IP_HEADER",
  "ENABLE_EXPERIMENTAL_COREPACK",
  "LINK_HOST",
  "PANEL_HOST",
  ...PANEL_REQUIRED,
  "COMMERCIAL_CONTACT_EMAIL",
  "PANEL_DOCUMENTS_ORIGIN",
  "PANEL_DOCUMENTS_MODE",
  "DOCUMENTS_DOMAIN_CHECKED_AT",
];

/**
 * Parses the dotenv file `vercel env pull` writes (KEY="value" lines).
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseDotenv(text) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match?.[1]) continue;
    const raw = match[2] ?? "";
    env[match[1]] =
      raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')
        ? raw.slice(1, -1)
        : raw;
  }
  return env;
}

/**
 * @param {string} value
 * @returns {URL | undefined}
 */
function toUrl(value) {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/**
 * Returns one message per problem; an empty list means the environment is fine.
 * @param {Record<string, string | undefined>} env
 * @param {{ target: "preview" | "production", productionApiOrigin: string }} options
 * @returns {string[]}
 */
export function checkDeployEnv(env, { target, productionApiOrigin }) {
  /** @type {string[]} */
  const problems = [];
  const productionOrigin = new URL(productionApiOrigin).origin;

  const markedSensitive = new Set(
    PLAIN_KEYS.filter((key) => env[key] === SENSITIVE_PLACEHOLDER),
  );
  for (const key of markedSensitive) {
    problems.push(
      `${key} is marked Sensitive in Vercel; it must be a plain variable so CI can check it (delete it and re-add it without Sensitive)`,
    );
  }

  for (const key of API_URL_KEYS) {
    if (markedSensitive.has(key)) continue;
    const value = env[key];
    if (value === undefined || value === "") {
      problems.push(`${key} is missing`);
      continue;
    }
    const url = toUrl(value);
    if (url === undefined || url.protocol !== "https:") {
      problems.push(`${key} must be an https: URL`);
      continue;
    }
    if (target === "production" && url.origin !== productionOrigin) {
      problems.push(`${key} must be ${productionOrigin} in production`);
    }
    if (target === "preview" && url.origin === productionOrigin) {
      problems.push(`${key} must not be the production API in preview`);
    }
  }

  const bffKey = env.API_BFF_KEY;
  if (
    bffKey !== undefined &&
    bffKey !== "" &&
    bffKey !== SENSITIVE_PLACEHOLDER
  ) {
    problems.push("API_BFF_KEY must be a Sensitive variable in Vercel");
  }
  if (env.API_ALLOW_LOOPBACK_HTTP !== undefined) {
    problems.push(
      "API_ALLOW_LOOPBACK_HTTP must not be set in a deployed environment",
    );
  }
  if (
    !markedSensitive.has("CLIENT_IP_HEADER") &&
    env.CLIENT_IP_HEADER?.toLowerCase() !== VERCEL_CLIENT_IP_HEADER
  ) {
    problems.push(`CLIENT_IP_HEADER must be ${VERCEL_CLIENT_IP_HEADER}`);
  }
  if (env.CLIENT_IP_TRUSTED_HOPS !== undefined) {
    problems.push("CLIENT_IP_TRUSTED_HOPS must not be set");
  }
  problems.push(...hostProblems(env, target, markedSensitive));
  problems.push(...documentsProblems(env, target, markedSensitive));
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      problems.push(`${key}: no NEXT_PUBLIC_* variable is allowed`);
    }
  }
  return problems;
}

/**
 * The host and panel rules (ADR-0008 rule 7; plan § 2.10 Env).
 * @param {Record<string, string | undefined>} env
 * @param {"preview" | "production"} target
 * @param {Set<string>} markedSensitive
 * @returns {string[]}
 */
function hostProblems(env, target, markedSensitive) {
  /** @type {string[]} */
  const problems = [];
  const set = (/** @type {string} */ key) =>
    env[key] !== undefined && env[key] !== "" && !markedSensitive.has(key);
  if (
    target === "production" &&
    env.LINK_HOST !== PRODUCTION_LINK_HOST &&
    !markedSensitive.has("LINK_HOST")
  ) {
    problems.push(`LINK_HOST must be ${PRODUCTION_LINK_HOST} in production`);
  }
  if (!set("PANEL_HOST")) return problems;
  if (target === "production" && env.PANEL_HOST !== PRODUCTION_PANEL_HOST) {
    problems.push(
      `PANEL_HOST must be unset or ${PRODUCTION_PANEL_HOST} in production`,
    );
  }
  for (const key of PANEL_REQUIRED) {
    if (!set(key) && !markedSensitive.has(key))
      problems.push(`${key} is required when PANEL_HOST is set`);
  }
  for (const key of LEGAL_URL_KEYS) {
    if (!set(key)) continue;
    const url = toUrl(env[key] ?? "");
    if (url === undefined || url.protocol !== "https:")
      problems.push(`${key} must be an https: URL`);
  }
  if (
    target === "production" &&
    TURNSTILE_TEST_KEY.test(env.TURNSTILE_SITE_KEY ?? "")
  ) {
    problems.push(
      "TURNSTILE_SITE_KEY must not be a Cloudflare test key in production",
    );
  }
  return problems;
}

/**
 * The documents domain and the F3 gate (T116; Security F2, F3, F4; QA Q1).
 * @param {Record<string, string | undefined>} env
 * @param {"preview" | "production"} target
 * @param {Set<string>} markedSensitive
 * @returns {string[]}
 */
function documentsProblems(env, target, markedSensitive) {
  /** @type {string[]} */
  const problems = [];
  const set = (/** @type {string} */ key) =>
    env[key] !== undefined && env[key] !== "" && !markedSensitive.has(key);
  const panelLit = set("PANEL_HOST");

  if (set("PANEL_DOCUMENTS_ORIGIN")) {
    const value = env.PANEL_DOCUMENTS_ORIGIN ?? "";
    const url = toUrl(value);
    const bare =
      url !== undefined &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      !/[?#]/.test(value);
    if (!bare) {
      problems.push(
        "PANEL_DOCUMENTS_ORIGIN must be an origin with no credentials, path, query or fragment",
      );
    } else if (url.protocol !== "https:") {
      problems.push("PANEL_DOCUMENTS_ORIGIN must be https:");
    } else {
      const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
      if (hostname === SITE_DOMAIN || hostname.endsWith(`.${SITE_DOMAIN}`)) {
        problems.push(
          `PANEL_DOCUMENTS_ORIGIN must not be ${SITE_DOMAIN} or under it (a separate registrable domain)`,
        );
      } else if (
        (panelLit && url.host === env.PANEL_HOST?.toLowerCase()) ||
        (set("LINK_HOST") && url.host === env.LINK_HOST?.toLowerCase())
      ) {
        problems.push(
          "PANEL_DOCUMENTS_ORIGIN must not be the panel or link host",
        );
      }
    }
  } else if (
    target === "production" &&
    panelLit &&
    !markedSensitive.has("PANEL_DOCUMENTS_ORIGIN")
  ) {
    problems.push(
      "PANEL_DOCUMENTS_ORIGIN is required when PANEL_HOST is set in production",
    );
  }

  if (!set("PANEL_DOCUMENTS_MODE")) return problems;
  const mode = env.PANEL_DOCUMENTS_MODE ?? "";
  if (!DOCUMENTS_MODES.includes(mode)) {
    problems.push("PANEL_DOCUMENTS_MODE must be redirect or attachment");
    return problems;
  }
  if (target !== "production" || mode !== "redirect") return problems;
  if (markedSensitive.has("DOCUMENTS_DOMAIN_CHECKED_AT")) return problems;
  const checkedAt = env.DOCUMENTS_DOMAIN_CHECKED_AT ?? "";
  if (checkedAt === "") {
    problems.push(
      "PANEL_DOCUMENTS_MODE=redirect needs DOCUMENTS_DOMAIN_CHECKED_AT (the F3 check: scripts/check-documents-domain.sh)",
    );
  } else if (
    !CHECKED_AT.test(checkedAt) ||
    Number.isNaN(Date.parse(checkedAt))
  ) {
    problems.push(
      "DOCUMENTS_DOMAIN_CHECKED_AT must be the UTC timestamp scripts/check-documents-domain.sh prints",
    );
  }
  return problems;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const [file, target] = process.argv.slice(2);
  if (!file || (target !== "preview" && target !== "production")) {
    console.error(
      "Usage: node scripts/check-deploy-env.mjs <env-file> <preview|production>",
    );
    process.exit(2);
  }
  const problems = checkDeployEnv(parseDotenv(readFileSync(file, "utf8")), {
    target,
    productionApiOrigin:
      process.env.PRODUCTION_API_ORIGIN || "https://api.kybr.com.br",
  });
  if (problems.length > 0) {
    console.error(`Deploy env check FAILED (${target}):`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(`Deploy env check: ${target} is wired correctly.`);
}
