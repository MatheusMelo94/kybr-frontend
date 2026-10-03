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
//
// It names variables, never their values.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VERCEL_CLIENT_IP_HEADER = "x-vercel-forwarded-for";
const API_URL_KEYS = ["API_BASE_URL", "API_PUBLIC_BASE_URL"];

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
  for (const key of Object.keys(env)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      problems.push(`${key}: no NEXT_PUBLIC_* variable is allowed`);
    }
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
