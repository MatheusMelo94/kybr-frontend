// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// ADR-0011 note (P4-004): sessionToken() stays inside lib/api/panel/*, where
// it attaches the bearer. features/** and app/(panel)/** check the session
// with requireSession() and never import it.

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes("__tests__"));
}

describe("sessionToken() stays in the DAL (ADR-0011)", () => {
  it("no module under features/ or app/(panel)/ uses it", () => {
    const offenders = [...sources("features"), ...sources("app/(panel)")].filter(
      // A call or an import; `sessionToken:` (panelRequest's field) is fine.
      (path) => /\bsessionToken\s*\(|\{[^}]*\bsessionToken\b[^}]*\}\s*from/.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
