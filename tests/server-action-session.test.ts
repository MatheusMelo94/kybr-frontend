// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// T118 (ADR-0011 Addendum 2; Security decisions 7 and 8), standing guards
// over every 'use server' module:
// - a session action asks requireSession() in result mode, so an expired
//   session is a SESSAO_EXPIRADA result, never a redirect thrown from an
//   action;
// - no action calls redirect(), apart from an explicit allowlist. While the
//   allowlist isn't empty, ADR-0008 Addendum 1's link-host Flight 404 stays
//   load-bearing (an action's redirect re-renders in process via the link
//   host locally) and must not be removed.

/** Modules allowed to redirect, and why. */
const REDIRECT_ALLOWLIST: Record<string, string> = {
  // logoutAction: the server redirect renders /entrar instead of the
  // current route, whose requireSession() would race the client (WebKit).
  "features/panel-auth/actions.ts": "logout",
};

/** The session actions' modules (ADR-0011 Addendum 2). */
const SESSION_MODULES = [
  "features/panel-fila/actions.ts",
  "features/panel-fila/poll-action.ts",
  "features/panel-home/actions.ts",
  "features/panel-lote/actions.ts",
  "features/panel-onboarding/actions.ts",
  "features/panel-settings/actions.ts",
  "features/panel-shell/actions.ts",
];

function serverModules(): string[] {
  return ["app", "features", "lib"]
    .flatMap((dir) =>
      readdirSync(dir, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
        .map((entry) => join(entry.parentPath, entry.name)),
    )
    .filter((path) => !path.includes("__tests__"))
    .filter((path) =>
      /^\s*(\/\/[^\n]*\n\s*)*["']use server["']/.test(
        readFileSync(path, "utf8"),
      ),
    )
    .sort();
}

/** The module's code, without comments (they may name the calls). */
function code(path: string): string {
  return readFileSync(path, "utf8").replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
}

/** Each requireSession( call's argument text, up to its closing paren. */
function requireSessionCalls(source: string): string[] {
  const calls: string[] = [];
  for (const match of source.matchAll(/\brequireSession\(/g)) {
    let depth = 1;
    let i = (match.index ?? 0) + match[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      if (source[i] === "(") depth += 1;
      if (source[i] === ")") depth -= 1;
      i += 1;
    }
    calls.push(source.slice(start, i - 1));
  }
  return calls;
}

describe("'use server' modules (T118 standing guards)", () => {
  const modules = serverModules();

  it("finds every session action module", () => {
    for (const path of SESSION_MODULES) expect(modules).toContain(path);
  });

  it("every requireSession() call in an action is in result mode (onMissing: 'result')", () => {
    const offenders = modules.flatMap((path) =>
      requireSessionCalls(code(path))
        .filter((args) => !/onMissing:\s*["']result["']/.test(args))
        .map((args) => `${path}: requireSession(${args})`),
    );
    expect(offenders).toEqual([]);
  });

  it("every session action module checks the session", () => {
    for (const path of SESSION_MODULES)
      expect(requireSessionCalls(code(path)).length).toBeGreaterThan(0);
  });

  it("decision 8: no redirect() in any 'use server' module outside the allowlist", () => {
    const redirecting = modules.filter((path) =>
      /\bredirect\s*\(/.test(code(path)),
    );
    expect(redirecting).toEqual(Object.keys(REDIRECT_ALLOWLIST).sort());
  });
});
