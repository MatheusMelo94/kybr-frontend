// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// DDR-0003 (brand v1; review B-003): a signal colour is a dot or a bar, with
// ink text, never a text colour. One source scan instead of per-component
// class checks; the computed colours are checked in Playwright
// (primitives.spec, brand.spec). The one exception is --color-danger-ink
// for field errors and form alerts.

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes("__tests__"));
}

describe("signal colours as text (DDR-0003)", () => {
  it("no text-success / -warning / -monitor, and text-danger only as -ink", () => {
    const offenders = ["app", "features", "components"]
      .flatMap(sources)
      .filter((file) =>
        /\btext-(success|warning|monitor)\b|\btext-danger(?!-ink)\b/.test(
          readFileSync(file, "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
