// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// Review 0024 / Security: the Sentry guard must scan every client chunk in
// .next/static, including next/dynamic chunks that app-build-manifest.json
// doesn't list for any page (the e-mail block and the upload).
const SCRIPT = resolve(__dirname, "../check-bundle-budget.mjs");
let dir: string;

function build(chunks: Record<string, string>): string {
  dir = mkdtempSync(join(tmpdir(), "bundle-guard-"));
  writeFileSync(
    join(dir, "bundle-budget.json"),
    JSON.stringify({ default: 180, routes: {} }),
  );
  mkdirSync(join(dir, ".next/static/chunks/app"), { recursive: true });
  writeFileSync(
    join(dir, ".next/app-build-manifest.json"),
    JSON.stringify({
      pages: { "/(link)/v/[slug]/page": ["static/chunks/app/page.js"] },
    }),
  );
  writeFileSync(join(dir, ".next/static/chunks/app/page.js"), "page();");
  for (const [name, source] of Object.entries(chunks))
    writeFileSync(join(dir, ".next/static/chunks", name), source);
  return dir;
}

function run(cwd: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("check-bundle-budget: Sentry guard", () => {
  it("fails on Sentry code in a lazy chunk no page lists", () => {
    const { status, output } = run(
      build({ "lazy-4821.js": 'import("@sentry/browser");' }),
    );

    expect(status).toBe(1);
    expect(output).toContain("lazy-4821.js");
  });

  it("passes and counts every .js under .next/static when there's none", () => {
    const { status, output } = run(build({ "lazy-4821.js": "leaf();" }));

    expect(status).toBe(0);
    expect(output).toContain(
      "Sentry bytes in client chunks: 0 (2 files checked)",
    );
  });
});
