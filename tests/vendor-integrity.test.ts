// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// ADR-0012 item 5 + Security C4 (M5P-05): the vendored SheetJS CE tarball is
// the one Security reviewed, it can't run install-time code, and nothing
// silently swaps it for the registry's frozen 0.18.5.

const TARBALL = "vendor/sheetjs/xlsx-0.20.3.tgz";
const SHA256 = "8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8";
const INSTALL_HOOKS = ["preinstall", "install", "postinstall", "prepare", "prepublish"];

describe("the vendored SheetJS (C4)", () => {
  it("hashes to the sha-256 Security recorded", () => {
    const hash = createHash("sha256").update(readFileSync(TARBALL)).digest("hex");
    expect(hash).toBe(SHA256);
  });

  it("its package.json has no install-time hook", () => {
    const manifest = JSON.parse(
      execFileSync("tar", ["-xzOf", TARBALL, "package/package.json"], {
        encoding: "utf8",
      }),
    ) as { name: string; version: string; scripts?: Record<string, string> };
    expect(manifest).toMatchObject({ name: "xlsx", version: "0.20.3" });
    for (const hook of INSTALL_HOOKS)
      expect(manifest.scripts?.[hook], hook).toBeUndefined();
  });

  it("the root package.json and the lockfile point at the vendored file", () => {
    const root = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(root.dependencies.xlsx).toBe(`file:${TARBALL}`);
    const lock = readFileSync("pnpm-lock.yaml", "utf8");
    expect(lock).toContain(`xlsx@file:${TARBALL}:`);
    expect(lock).toContain(`tarball: file:${TARBALL}`);
    expect(lock).not.toMatch(/\n {2}xlsx@\d/);
  });

  it("its builds stay blocked (allowBuilds: xlsx: false)", () => {
    expect(readFileSync("pnpm-workspace.yaml", "utf8")).toMatch(
      /allowBuilds:[\s\S]*\n {2}xlsx: false/,
    );
  });

  it("keeps the Apache-2.0 licence beside the tarball, and the notice is served", () => {
    expect(readFileSync("vendor/sheetjs/LICENSE", "utf8")).toContain(
      "Apache License",
    );
    const notices = readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
    expect(notices).toContain("SheetJS Community Edition 0.20.3");
    // The minifier drops SheetJS's /*! banner, so the app serves the notice (C12).
    expect(readFileSync("public/third-party-notices.txt", "utf8")).toContain(
      "SheetJS Community Edition 0.20.3",
    );
  });
});
