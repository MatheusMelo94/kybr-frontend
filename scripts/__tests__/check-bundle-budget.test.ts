// @vitest-environment node
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// Review 0024 / Security: the Sentry guard must scan every client chunk in
// .next/static, including next/dynamic chunks that app-build-manifest.json
// doesn't list for any page (the e-mail block and the upload).
const SCRIPT = resolve(__dirname, "../check-bundle-budget.mjs");
let dir: string;

function build(chunks: Record<string, string>): string {
  dir = mkdtempSync(join(tmpdir(), "bundle-guard-"));
  writeFileSync(
    join(dir, "bundle-budget.json"),
    JSON.stringify({ default: 180, routes: {} }),
  );
  mkdirSync(join(dir, ".next/static/chunks/app"), { recursive: true });
  writeFileSync(
    join(dir, ".next/app-build-manifest.json"),
    JSON.stringify({
      pages: { "/(link)/v/[slug]/page": ["static/chunks/app/page.js"] },
    }),
  );
  writeFileSync(join(dir, ".next/static/chunks/app/page.js"), "page();");
  for (const [name, source] of Object.entries(chunks))
    writeFileSync(join(dir, ".next/static/chunks", name), source);
  return dir;
}

function run(cwd: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: "" },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("check-bundle-budget: Sentry guard", () => {
  it("fails on Sentry code in a lazy chunk no page lists", () => {
    const { status, output } = run(
      build({ "lazy-4821.js": 'import("@sentry/browser");' }),
    );

    expect(status).toBe(1);
    expect(output).toContain("lazy-4821.js");
  });

  it("passes and counts every .js under .next/static when there's none", () => {
    const { status, output } = run(build({ "lazy-4821.js": "leaf();" }));

    expect(status).toBe(0);
    expect(output).toContain(
      "Sentry bytes in client chunks: 0 (2 files checked)",
    );
  });
});

// ADR-0010: panel budgets, the CSS pass and the /v/* isolation check, on
// fixture builds shaped like .next (app-build-manifest + per-page client
// reference manifests).
type FixturePage = {
  js?: Record<string, number>;
  css?: Record<string, number>;
  /** Client modules in this page's chunks. */
  modules?: string[];
  /** Client modules the (app-wide) manifest lists, in no chunk of this page. */
  offPage?: string[];
};

const ROOT_DIR = "/repo";

function fixture(
  pages: Record<string, FixturePage>,
  budget: Record<string, unknown>,
): string {
  dir = mkdtempSync(join(tmpdir(), "bundle-guard-"));
  writeFileSync(join(dir, "bundle-budget.json"), JSON.stringify(budget));
  mkdirSync(join(dir, ".next/static/chunks"), { recursive: true });
  mkdirSync(join(dir, ".next/static/css"), { recursive: true });
  const manifest: Record<string, string[]> = {};
  for (const [entry, page] of Object.entries(pages)) {
    const files: string[] = [];
    for (const [name, bytes] of Object.entries(page.js ?? {})) {
      // Random bytes don't compress: gzip size ≈ the byte count.
      writeFileSync(
        join(dir, ".next/static/chunks", name),
        randomBytes(bytes).toString("latin1"),
      );
      files.push(`static/chunks/${name}`);
    }
    manifest[entry] = files;
    const entryCSSFiles: Record<string, { path: string }[]> = {
      [`${ROOT_DIR}/app/layout`]: [],
    };
    for (const [name, bytes] of Object.entries(page.css ?? {})) {
      const body = name.startsWith("sentinel")
        ? `.isolate{isolation:isolate}${randomBytes(bytes).toString("hex")}`
        : randomBytes(bytes).toString("base64");
      writeFileSync(join(dir, ".next/static/css", name), body);
      entryCSSFiles[`${ROOT_DIR}/app/layout`]?.push({
        path: `static/css/${name}`,
      });
    }
    const serverFile = join(
      dir,
      ".next/server/app",
      `${entry}_client-reference-manifest.js`,
    );
    mkdirSync(dirname(serverFile), { recursive: true });
    const rsc = {
      clientModules: Object.fromEntries([
        ...(page.modules ?? []).map((module) => [
          `${ROOT_DIR}/${module}`,
          {
            chunks: files.flatMap((file, index) => [
              String(index),
              encodeURI(file),
            ]),
          },
        ]),
        ...(page.offPage ?? []).map((module) => [
          `${ROOT_DIR}/${module}`,
          { chunks: ["9", "static/chunks/elsewhere.js"] },
        ]),
      ]),
      entryCSSFiles,
    };
    writeFileSync(
      serverFile,
      `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(entry)}]=${JSON.stringify(rsc)};`,
    );
  }
  writeFileSync(
    join(dir, ".next/app-build-manifest.json"),
    JSON.stringify({ pages: manifest }),
  );
  return dir;
}

const BUDGET = {
  default: 180,
  routes: {
    "/v/*": 130,
    "/painel/entrar": 150,
    "/painel/cadastro*": 150,
    "/painel/senha/*": 150,
    "/painel/*": 180,
  },
  css: { routes: { "/v/*": 6, "/painel/*": 30 }, panelSentinel: "isolate" },
};

const LINK_PAGE = "/(link)/v/[slug]/(form)/page";

describe("check-bundle-budget: the panel (ADR-0010)", () => {
  it("passes a build within every budget", () => {
    const { status, output } = run(
      fixture(
        {
          [LINK_PAGE]: {
            js: { "a.js": 2_000 },
            css: { "link.css": 1_000 },
            modules: ["features/seller-link/components/verification-form.tsx"],
          },
          "/(panel)/painel/(focus)/entrar/page": {
            js: { "b.js": 2_000 },
            css: { "panel.css": 1_000 },
            modules: ["features/panel-auth/components/login-form.tsx"],
          },
        },
        BUDGET,
      ),
    );

    expect(output).toContain("/painel/entrar");
    expect(status).toBe(0);
  });

  it("applies the auth budget (150) before the panel's 180, by pattern order", () => {
    const { status, output } = run(
      fixture(
        {
          "/(panel)/painel/(focus)/cadastro/confirmar/page": {
            js: { "c.js": 160_000 },
          },
        },
        BUDGET,
      ),
    );

    expect(output).toMatch(
      /\/painel\/cadastro\/confirmar.*150 \(\/painel\/cadastro\*\).*OVER/,
    );
    expect(status).toBe(1);
  });

  it.each([
    "app/(panel)/painel/(app)/layout.tsx",
    "features/panel-shell/components/sidebar.tsx",
    "components/panel/data-table.tsx",
    "lib/gsap.ts",
  ])(
    "fails when a /v/* client manifest lists %s (isolation rule 1)",
    (module) => {
      const { status, output } = run(
        fixture(
          { [LINK_PAGE]: { js: { "a.js": 1_000 }, modules: [module] } },
          BUDGET,
        ),
      );

      expect(output).toContain("isolation");
      expect(output).toContain(module);
      expect(status).toBe(1);
    },
  );

  it("passes a panel module that the app-wide manifest lists but no /v/* chunk loads", () => {
    const { status } = run(
      fixture(
        {
          [LINK_PAGE]: {
            js: { "a.js": 1_000 },
            offPage: [
              "app/(panel)/painel/panel.css",
              "features/panel-auth/actions.ts",
            ],
          },
        },
        BUDGET,
      ),
    );

    expect(status).toBe(0);
  });

  it("fails when a route's CSS is over its budget", () => {
    const { status, output } = run(
      fixture(
        { [LINK_PAGE]: { js: { "a.js": 1_000 }, css: { "big.css": 7_000 } } },
        BUDGET,
      ),
    );

    expect(output).toMatch(/CSS/);
    expect(output).toMatch(/\/v\/\[slug\].*OVER/);
    expect(status).toBe(1);
  });

  it("fails when the panel's sentinel class reaches a /v/* stylesheet", () => {
    const { status, output } = run(
      fixture(
        {
          [LINK_PAGE]: {
            js: { "a.js": 1_000 },
            css: { "sentinel-link.css": 100 },
          },
        },
        BUDGET,
      ),
    );

    expect(output).toContain("isolate");
    expect(status).toBe(1);
  });

  it("still fails on Sentry code in a client chunk", () => {
    const dir = fixture({ [LINK_PAGE]: { js: { "a.js": 1_000 } } }, BUDGET);
    writeFileSync(
      join(dir, ".next/static/chunks/s.js"),
      'import("@sentry/browser");',
    );

    expect(run(dir).status).toBe(1);
  });
});

describe("check-bundle-budget: layouts count (T55)", () => {
  it("adds every ancestor layout's JS to a page's First Load JS", () => {
    const dir = fixture(
      {
        "/(panel)/painel/(app)/page": { js: { "page.js": 2_000 } },
        "/(panel)/painel/(app)/layout": { js: { "shell.js": 170_000 } },
      },
      BUDGET,
    );

    const { status, output } = run(dir);
    // 2 kB of page + 170 kB of layout: over 180 only if the layout counts.
    expect(output).toMatch(
      /'\/painel' +│ '\d+\.\d' +│ '180 \(\/painel\/\*\)' +│ 'OVER'/,
    );
    expect(status).toBe(1);
  });
});

// T71 / ADR-0012 item 6: the parser worker's sentinel. It must sit in a
// worker chunk, never in any route's First Load JS.
describe("check-bundle-budget: the parser worker sentinel", () => {
  const SENTINEL = "kybr-lote-parser/1";

  function buildWith(pageSource: string, chunks: Record<string, string>): string {
    const cwd = build(chunks);
    writeFileSync(
      join(cwd, "bundle-budget.json"),
      JSON.stringify({
        default: 180,
        routes: {},
        firstLoadForbidden: [SENTINEL, "SheetJS"],
        workerRequired: SENTINEL,
      }),
    );
    writeFileSync(join(cwd, ".next/static/chunks/app/page.js"), pageSource);
    return cwd;
  }

  it("passes when only a lazy worker chunk carries it", () => {
    const { status, output } = run(
      buildWith("page();", { "4181.abc.js": `postMessage("${SENTINEL}")` }),
    );
    expect(status).toBe(0);
    expect(output).toContain("Parser worker: sentinel in 4181.abc.js only");
  });

  it("fails when a route's First Load JS carries the sentinel", () => {
    const { status, output } = run(
      buildWith(`x("${SENTINEL}")`, { "4181.abc.js": `postMessage("${SENTINEL}")` }),
    );
    expect(status).toBe(1);
    expect(output).toContain(`/v/[slug] First Load JS has "${SENTINEL}"`);
  });

  it("fails when SheetJS code reaches First Load JS", () => {
    const { status, output } = run(
      buildWith('throw new Error("SheetJS")', {
        "4181.abc.js": `postMessage("${SENTINEL}")`,
      }),
    );
    expect(status).toBe(1);
    expect(output).toContain('First Load JS has "SheetJS"');
  });

  it("fails when no chunk in .next/static carries it (the worker didn't build)", () => {
    const { status, output } = run(buildWith("page();", { "lazy.js": "leaf();" }));
    expect(status).toBe(1);
    expect(output).toContain(`no client chunk carries "${SENTINEL}"`);
  });
});
