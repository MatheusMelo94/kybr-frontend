// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Security O-F3 (T136): one session-cookie writer. Only cookies.ts writes
// the cookie; only the auth actions and the password change call it, and
// each parses the API's grant with the shared sessionGrantSchema (no local
// session schema).

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes("__tests__"));
}

const files = ["app", "features", "components", "lib"].flatMap(sources);
const read = (file: string) => readFileSync(file, "utf8");

describe("the session cookie has one writer (O-F3)", () => {
  it("only lib/api/panel/cookies.ts sets the session cookie", () => {
    expect(
      files.filter((file) => /\.set\(\s*session\b/.test(read(file))),
    ).toEqual(["lib/api/panel/cookies.ts"]);
  });

  it("setSessionCookie is called only by the auth and password actions", () => {
    expect(
      files.filter((file) => /\bsetSessionCookie\(/.test(read(file))).sort(),
    ).toEqual([
      "features/panel-auth/actions.ts",
      "features/panel-settings/actions.ts",
      "lib/api/panel/cookies.ts",
    ]);
  });

  it("each grant is parsed with sessionGrantSchema and no session schema of its own", () => {
    // The login parses in its action; the password change in D-A6's data
    // function, whose result is the only thing its action writes from.
    for (const file of [
      "features/panel-auth/actions.ts",
      "lib/api/panel/password.ts",
    ]) {
      const source = read(file);
      expect(source, file).toContain("sessionGrantSchema");
      expect(source, file).not.toMatch(/sessao:\s*z\./);
    }
    expect(read("features/panel-settings/actions.ts")).not.toMatch(
      /sessao:\s*z\./,
    );
  });
});
