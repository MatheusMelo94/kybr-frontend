// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

// O-F5 (T149): every buffered CSV shares lib/api/panel/csv-limits.ts's
// CSV_MAX_BYTES. A megabyte-scale literal in any other lib/ or features/
// source that handles CSV is a second cap that can drift past Vercel's
// 4.5 MB response limit (M5's 5 MB did).

const ROOT = join(__dirname, "..");
const SHARED = "lib/api/panel/csv-limits.ts";
const MEGABYTES =
  /\d+(?:\.\d+)?\s*\*\s*1024\s*\*\s*1024|\b\d{1,3}(?:_\d{3}){2,}\b|\b\d{7,}\b/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory())
      return name === "__tests__" || name === "node_modules"
        ? []
        : sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("one CSV byte cap (O-F5)", () => {
  it("the shared constant is the only CSV byte cap literal in lib/ and features/", () => {
    const offenders = ["lib", "features"]
      .flatMap((dir) => sources(join(ROOT, dir)))
      .map((path) => relative(ROOT, path))
      .filter((path) => path !== SHARED)
      .filter((path) => {
        const text = readFileSync(join(ROOT, path), "utf8");
        return /csv/i.test(text) && MEGABYTES.test(text);
      });
    expect(offenders).toEqual([]);
  });

  it("the shared module declares it", () => {
    expect(readFileSync(join(ROOT, SHARED), "utf8")).toMatch(
      /export const CSV_MAX_BYTES = 4 \* 1024 \* 1024;/,
    );
  });
});
