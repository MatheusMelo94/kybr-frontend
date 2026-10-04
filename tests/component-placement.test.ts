// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// ADR-0010 rule 3 (review P4-005): components/ui holds what the link uses,
// and link.css scans all of it. A primitive only the panel renders goes in
// components/panel/, which link.css never scans, so its classes can't leak
// into /v/* CSS without anyone keeping an exclusion list.

const LINK_SOURCES = [
  "features/seller-link",
  "app/(link)",
  "app/layout.tsx",
  "app/not-found.tsx",
  "app/global-error.tsx",
  "components/ui",
];

function files(path: string): string[] {
  if (/\.tsx?$/.test(path)) return [path];
  return readdirSync(path, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !file.includes("__tests__"));
}

describe("components/ui is the link's (ADR-0010 rule 3)", () => {
  it("every components/ui module is imported by link code; panel-only ones live in components/panel", () => {
    const link = LINK_SOURCES.flatMap(files).map((file) => ({
      file,
      text: readFileSync(file, "utf8"),
    }));
    const unused = files("components/ui")
      .map((file) => file.replace(/^components\/ui\/|\.tsx?$/g, ""))
      .filter(
        (name) =>
          !link.some(
            ({ file, text }) =>
              !file.endsWith(`/${name}.tsx`) &&
              text.includes(`@/components/ui/${name}"`),
          ),
      );
    expect(unused).toEqual([]);
  });

  it("link.css keeps no hand-kept exclusion list", () => {
    expect(readFileSync("app/(link)/link.css", "utf8")).not.toMatch(
      /@source not/,
    );
  });
});
