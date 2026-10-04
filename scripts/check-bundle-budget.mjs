#!/usr/bin/env node
// Bundle guard: fails when a route's First Load JS is over its budget.
//
// Budgets live in bundle-budget.json and are owned by the Frontend Architect
// (frontend-architecture-conventions.md § Performance Budgets, ADR-0003).
// Never raise one here to turn CI green.
//
// It reproduces the "First Load JS" column of `next build` (Next 15, webpack):
// the gzip size (level 9) of the .js files that .next/app-build-manifest.json
// lists for the page, in kB of 1000 bytes. Run it after `pnpm build`.
//
// A budgeted route pattern with no built route yet is reported, not failed, so
// the guard can land before the routes do.

import { readFileSync, readdirSync, appendFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const distDir = join(root, ".next");
const config = JSON.parse(
  readFileSync(join(root, "bundle-budget.json"), "utf8"),
);

let manifest;
try {
  manifest = JSON.parse(
    readFileSync(join(distDir, "app-build-manifest.json"), "utf8"),
  );
} catch {
  console.error(
    "Bundle guard: .next/app-build-manifest.json not found. Run `pnpm build` first.",
  );
  process.exit(1);
}

/** "/(link)/v/[slug]/page" -> "/v/[slug]"; null for non-page entries. */
function routeOf(entry) {
  if (!entry.endsWith("/page")) return null;
  const segments = entry
    .slice(0, -"/page".length)
    .split("/")
    .filter(
      (s) =>
        s !== "" &&
        !(s.startsWith("(") && s.endsWith(")")) &&
        !s.startsWith("@"),
    );
  return "/" + segments.join("/");
}

/** "/v/*" matches "/v" and everything below it; anything else matches exactly. */
function matches(pattern, route) {
  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    return route === base || route.startsWith(base + "/");
  }
  return route === pattern;
}

const gzipCache = new Map();
function gzipBytes(file) {
  if (!gzipCache.has(file)) {
    const buf = readFileSync(join(distDir, file));
    gzipCache.set(file, gzipSync(buf, { level: 9 }).length);
  }
  return gzipCache.get(file);
}

const routes = new Map();
for (const [entry, files] of Object.entries(manifest.pages)) {
  const route = routeOf(entry);
  if (route === null) continue;
  const js = [...new Set(files.filter((f) => f.endsWith(".js")))];
  routes.set(
    route,
    js.reduce((sum, f) => sum + gzipBytes(f), 0),
  );
}

const patterns = Object.entries(config.routes ?? {});
function budgetFor(route) {
  const hit = patterns.find(([pattern]) => matches(pattern, route));
  return hit
    ? { kb: hit[1], source: hit[0] }
    : { kb: config.default, source: "default" };
}

const kb = (bytes) => (bytes / 1000).toFixed(1);
const rows = [];
let failed = false;
for (const route of [...routes.keys()].sort()) {
  const bytes = routes.get(route);
  const budget = budgetFor(route);
  const over = bytes > budget.kb * 1000;
  failed ||= over;
  rows.push({
    route,
    size: kb(bytes),
    budget: `${budget.kb} (${budget.source})`,
    status: over ? "OVER" : "ok",
  });
}

console.log("Bundle guard: First Load JS, gzip kB");
console.table(rows);

const missing = patterns
  .map(([pattern]) => pattern)
  .filter((pattern) => ![...routes.keys()].some((r) => matches(pattern, r)));
for (const pattern of missing) {
  console.log(
    `Notice: no built route matches ${pattern} yet; nothing to check.`,
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    "### Bundle guard (First Load JS, gzip)",
    "",
    "| Route | kB | Budget kB | Status |",
    "|---|---:|---|---|",
    ...rows.map(
      (r) => `| \`${r.route}\` | ${r.size} | ${r.budget} | ${r.status} |`,
    ),
    ...missing.map((p) => `| \`${p}\` | — | not built yet | skipped |`),
    "",
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
}

// T34a / ADR-0003: monitoring is server-side only. No page may ship Sentry
// code to the browser (no browser SDK, no withSentryConfig injection). Every
// .js under .next/static is scanned, not only the manifest's page files: the
// next/dynamic leaves (e-mail block, upload) are chunks no page lists
// (review 0024).
const clientFiles = new Set(
  readdirSync(join(distDir, "static"), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".js"))
    .map((f) => relative(distDir, join(distDir, "static", f))),
);
const sentryFiles = [...clientFiles].filter((f) =>
  /@sentry\/|sentry\.io|__SENTRY|Sentry\.init/.test(
    readFileSync(join(distDir, f), "utf8"),
  ),
);
if (sentryFiles.length > 0) {
  console.error(
    `Bundle guard FAILED: Sentry code in client chunks: ${sentryFiles.join(", ")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Sentry bytes in client chunks: 0 (${clientFiles.size} files checked).`,
  );
}

if (failed) {
  console.error(
    "Bundle guard FAILED: a route is over budget. Fix the bundle (Frontend Engineer) or change the budget by ADR (Frontend Architect).",
  );
  process.exit(1);
}
