// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// ADR-0010 rule 3 (review P4-005): components/ui holds what the link uses
// (shared or not yet wired), and link.css scans all of it. A primitive only the panel renders goes in
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

const PANEL_SOURCES = [
  "features/panel-auth",
  "features/panel-onboarding",
  "features/panel-shell",
  "app/(panel)",
];

function files(path: string): string[] {
  if (/\.tsx?$/.test(path)) return [path];
  return readdirSync(path, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !file.includes("__tests__"));
}

describe("components/ui is the link's (ADR-0010 rule 3)", () => {
  it("no components/ui module is used by the panel alone: those live in components/panel", () => {
    const read = (paths: string[]) =>
      paths.flatMap(files).map((file) => ({
        file,
        text: readFileSync(file, "utf8"),
      }));
    const link = read(LINK_SOURCES);
    const panel = read(PANEL_SOURCES);
    const imports = (
      sources: { file: string; text: string }[],
      name: string,
    ): boolean =>
      sources.some(
        ({ file, text }) =>
          !file.endsWith(`/${name}.tsx`) &&
          text.includes(`@/components/ui/${name}"`),
      );
    const panelOnly = files("components/ui")
      .map((file) => file.replace(/^components\/ui\/|\.tsx?$/g, ""))
      .filter((name) => imports(panel, name) && !imports(link, name));
    expect(panelOnly).toEqual([]);
  });

  it("link.css keeps no hand-kept exclusion list", () => {
    expect(readFileSync("app/(link)/link.css", "utf8")).not.toMatch(
      /@source not/,
    );
  });
});
