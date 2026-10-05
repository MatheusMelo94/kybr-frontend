// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Brand v1 B5 (identity.md › Typography): text sizes come from the brand
// scale tokens (text-body, -secondary, -title, -lead, -h2, -verdict, -label,
// -input), never Tailwind's default sizes, and the lead is Lead 20 / 300.

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes("__tests__"));
}

const FILES = ["app", "features", "components"].flatMap(sources);

describe("the brand type scale (B5)", () => {
  it("uses no Tailwind default text size", () => {
    const offenders = FILES.filter((file) =>
      /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("sets a lead paragraph in text-lead, never text-body", () => {
    const offenders = FILES.filter((file) =>
      /text-body font-lead|font-lead text-body/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
