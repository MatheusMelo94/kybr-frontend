// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Security 0003 (INFO): the runtime image's static files are root-owned, so
// the serving user (app) can read but never modify them.

const dockerfile = readFileSync("Dockerfile", "utf8");
const copyLine = (target: string): string | undefined =>
  dockerfile
    .split("\n")
    .find(
      (line) =>
        line.startsWith("COPY --from=build") &&
        line.trim().endsWith(` ${target}`),
    );

describe("Dockerfile runtime stage", () => {
  it.each(["./public", "./.next/static"])(
    "copies %s without --chown (root-owned, read-only for app)",
    (target) => {
      const line = copyLine(target);
      expect(line).toBeDefined();
      expect(line).not.toMatch(/--chown/);
    },
  );

  it("still runs as the unprivileged app user", () => {
    expect(dockerfile).toMatch(/^USER app$/m);
  });
});
