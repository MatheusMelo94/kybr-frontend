#!/usr/bin/env node
// Bundle guard: fails when a route's First Load JS is over its budget.
//
// Budgets live in bundle-budget.json and are owned by the Frontend Architect
// (frontend-architecture-conventions.md § Performance Budgets, ADR-0003).
// Never raise one here to turn CI green.
//
// It measures First Load JS like the "First Load JS" column of `next build`
// (Next 15, webpack): the gzip size (level 9) of the .js files that
// .next/app-build-manifest.json lists, in kB of 1000 bytes, but for the page
// AND its ancestor layouts (Next's column leaves nested layouts out). Run it
// after `pnpm build`.
//
// A budgeted route pattern with no built route yet is reported, not failed, so
// the guard can land before the routes do.
//
// ADR-0010 adds, per page, from its client reference manifest
// (.next/server/app/<entry>_client-reference-manifest.js):
// - a CSS pass: the gzip size of the stylesheets the page's segments load
//   (global-error's excluded: it loads only when the root layout fails),
//   against bundle-budget.json › css.routes;
// - isolation: no /v/* page may list a panel client module, and no /v/*
//   stylesheet may carry the panel's sentinel class (css.panelSentinel).

import { existsSync, readFileSync, readdirSync, appendFileSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";
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

/**
 * "/v/*" matches "/v" and everything below it; "/painel/cadastro*" matches
 * every route that starts with "/painel/cadastro"; anything else matches
 * exactly. The first matching pattern wins, in the file's order.
 */
function matches(pattern, route) {
  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    return route === base || route.startsWith(base + "/");
  }
  if (pattern.endsWith("*")) return route.startsWith(pattern.slice(0, -1));
  return route === pattern;
}

/** "/(a)/b/page" -> ["/layout", "/(a)/layout", "/(a)/b/layout"]. */
function ancestorLayouts(entry) {
  const segments = entry.split("/").slice(1, -1);
  return segments
    .map((_, index) => `/${segments.slice(0, index + 1).join("/")}/layout`)
    .concat("/layout");
}

/** The page's client reference manifest, or undefined (not built, or a fixture without one). */
function referenceManifest(entry) {
  const file = join(
    distDir,
    "server/app",
    `${entry}_client-reference-manifest.js`,
  );
  if (!existsSync(file)) return undefined;
  const sandbox = {};
  sandbox.globalThis = sandbox;
  runInNewContext(readFileSync(file, "utf8"), sandbox);
  return sandbox.__RSC_MANIFEST?.[entry];
}

/** The stylesheets a page loads: every segment's, except global-error's. */
function cssFilesOf(rsc) {
  const files = new Set();
  for (const [segment, list] of Object.entries(rsc?.entryCSSFiles ?? {})) {
    if (segment.endsWith("/global-error")) continue;
    for (const item of list) if (!item.inlined) files.add(item.path);
  }
  return [...files];
}

// ADR-0010 isolation rule 1: panel code that must never reach a /v/* client bundle.
const PANEL_MODULE_MARKERS = [
  "/app/(panel)/",
  "/features/panel-",
  "/components/panel/",
  "/lib/gsap",
];

const gzipCache = new Map();
function gzipBytes(file) {
  if (!gzipCache.has(file)) {
    const buf = readFileSync(join(distDir, file));
    gzipCache.set(file, gzipSync(buf, { level: 9 }).length);
  }
  return gzipCache.get(file);
}

const routes = new Map();
const isolationProblems = [];
for (const [entry, files] of Object.entries(manifest.pages)) {
  const route = routeOf(entry);
  if (route === null) continue;
  // The page's chunks plus every ancestor layout's: Next's own "First Load
  // JS" column leaves nested layouts out, which would hide a shell's client
  // code (the panel's (app) layout, T55).
  const js = [
    ...new Set(
      [
        ...files,
        ...ancestorLayouts(entry).flatMap(
          (layout) => manifest.pages[layout] ?? [],
        ),
      ].filter((f) => f.endsWith(".js")),
    ),
  ];
  const rsc = referenceManifest(entry);
  const css = cssFilesOf(rsc);
  routes.set(route, {
    jsFiles: js,
    js: js.reduce((sum, f) => sum + gzipBytes(f), 0),
    css:
      rsc === undefined
        ? undefined
        : css.reduce((sum, f) => sum + gzipBytes(f), 0),
    cssFiles: css,
  });
  if (matches("/v/*", route)) {
    // clientModules is app-wide; a module is on this page only when one of
    // its chunk files is (paths in `chunks` are URL-encoded).
    const pageFiles = new Set(js);
    for (const [clientModule, entry] of Object.entries(
      rsc?.clientModules ?? {},
    )) {
      if (!PANEL_MODULE_MARKERS.some((m) => clientModule.includes(m))) continue;
      const onPage = (entry.chunks ?? []).some(
        (chunk) =>
          chunk.endsWith(".js") && pageFiles.has(decodeURIComponent(chunk)),
      );
      if (onPage)
        isolationProblems.push(
          `${route} loads panel module ${relative(root, clientModule)}`,
        );
    }
  }
}

function budgetIn(patterns, route, fallback) {
  const hit = patterns.find(([pattern]) => matches(pattern, route));
  if (hit) return { kb: hit[1], source: hit[0] };
  return fallback === undefined
    ? undefined
    : { kb: fallback, source: "default" };
}
const jsPatterns = Object.entries(config.routes ?? {});
const cssPatterns = Object.entries(config.css?.routes ?? {});

const kb = (bytes) => (bytes / 1000).toFixed(1);
const rows = [];
const cssRows = [];
let failed = false;
let cssFailed = false;
for (const route of [...routes.keys()].sort()) {
  const { js, css } = routes.get(route);
  const budget = budgetIn(jsPatterns, route, config.default);
  const over = js > budget.kb * 1000;
  failed ||= over;
  rows.push({
    route,
    size: kb(js),
    budget: `${budget.kb} (${budget.source})`,
    status: over ? "OVER" : "ok",
  });
  if (css === undefined) continue;
  const cssBudget = budgetIn(cssPatterns, route);
  const cssOver = cssBudget !== undefined && css > cssBudget.kb * 1000;
  cssFailed ||= cssOver;
  cssRows.push({
    route,
    size: (css / 1000).toFixed(2),
    budget: cssBudget ? `${cssBudget.kb} (${cssBudget.source})` : "none",
    status: cssOver ? "OVER" : "ok",
  });
}

console.log("Bundle guard: First Load JS, gzip kB");
console.table(rows);
if (cssRows.length > 0) {
  console.log("Bundle guard: CSS, gzip kB");
  console.table(cssRows);
}

// ADR-0010 isolation rule 2: a class only the panel uses must never compile
// into a /v/* stylesheet (it would mean the link's @source scans panel files).
const sentinel = config.css?.panelSentinel;
if (sentinel) {
  const pattern = new RegExp(
    `\\.${sentinel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
  );
  for (const [route, { cssFiles }] of routes) {
    if (!matches("/v/*", route)) continue;
    for (const file of cssFiles) {
      if (pattern.test(readFileSync(join(distDir, file), "utf8")))
        isolationProblems.push(
          `${route} stylesheet ${file} has the panel sentinel .${sentinel}`,
        );
    }
  }
}
if (isolationProblems.length > 0) {
  console.error(
    `Bundle guard FAILED: /v/* isolation (ADR-0010):\n  ${[...new Set(isolationProblems)].join("\n  ")}`,
  );
  process.exitCode = 1;
} else {
  console.log("Isolation: no panel module or panel CSS in any /v/* route.");
}

const missing = jsPatterns
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
    "### Bundle guard (CSS, gzip)",
    "",
    "| Route | kB | Budget kB | Status |",
    "|---|---:|---|---|",
    ...cssRows.map(
      (r) => `| \`${r.route}\` | ${r.size} | ${r.budget} | ${r.status} |`,
    ),
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

// ADR-0012 item 6 (T71): Lote's parser runs in a worker. Its sentinel (and
// SheetJS) must never reach a route's First Load JS, and some client chunk
// must carry the sentinel (the worker was built).
const forbidden = config.firstLoadForbidden ?? [];
const sentinelProblems = [];
for (const [route, { jsFiles }] of routes) {
  for (const file of jsFiles) {
    const source = readFileSync(join(distDir, file), "utf8");
    for (const marker of forbidden)
      if (source.includes(marker))
        sentinelProblems.push(`${route} First Load JS has "${marker}" (${file})`);
  }
}
if (config.workerRequired !== undefined) {
  const carriers = [...clientFiles].filter((f) =>
    readFileSync(join(distDir, f), "utf8").includes(config.workerRequired),
  );
  if (carriers.length === 0)
    sentinelProblems.push(
      `no client chunk carries "${config.workerRequired}" (the parser worker wasn't built)`,
    );
  else if (sentinelProblems.length === 0)
    console.log(
      `Parser worker: sentinel in ${carriers.map((f) => f.split("/").pop()).join(", ")} only (no First Load JS).`,
    );
}
if (sentinelProblems.length > 0) {
  console.error(
    `Bundle guard FAILED: the parser worker (ADR-0012):\n  ${[...new Set(sentinelProblems)].join("\n  ")}`,
  );
  process.exitCode = 1;
}

if (cssFailed) {
  console.error(
    "Bundle guard FAILED: a route's CSS is over budget (ADR-0010). Fix the stylesheet or its @source list (Frontend Engineer) or change the budget by ADR (Frontend Architect).",
  );
  process.exitCode = 1;
}

if (failed) {
  console.error(
    "Bundle guard FAILED: a route is over budget. Fix the bundle (Frontend Engineer) or change the budget by ADR (Frontend Architect).",
  );
  process.exit(1);
}
