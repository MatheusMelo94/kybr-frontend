// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { panelPath } from "@/lib/panel-paths";

const ROOT = resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true })
    .map(String)
    .filter((file) => /\.(ts|tsx|mts)$/.test(file))
    .map((file) => join(dir, file));
}

describe("panelPath (ADR-0008 rule 2)", () => {
  it.each([
    ["/", "/painel"],
    ["/fila", "/painel/fila"],
    ["/fila/abc", "/painel/fila/abc"],
  ])("%s → %s", (external, internal) => {
    expect(panelPath(external)).toBe(internal);
  });

  it.each(["fila", "", "//fila", "https://evil.example/x"])(
    "refuses %j: only an absolute external path gets the prefix",
    (path) => {
      expect(() => panelPath(path)).toThrow();
    },
  );

  it("is the only source of the internal prefix in app/ and features/", () => {
    const offenders = [
      ...sourceFiles("app"),
      ...sourceFiles("features"),
    ].filter((file) =>
      /["'`]\/painel(?![a-z])/.test(readFileSync(join(ROOT, file), "utf8")),
    );

    expect(offenders.map((file) => relative(ROOT, join(ROOT, file)))).toEqual(
      [],
    );
  });
});
