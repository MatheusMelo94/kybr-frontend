// @vitest-environment node
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// T62: the post-deploy smoke on the panel host and on an unknown host
// (ADR-0008 rule 4: a production *.vercel.app alias answers 404).

const SCRIPT = resolve(__dirname, "../check-deploy-headers.sh");
const COMMON = {
  "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
  "x-frame-options": "DENY",
};
const LINK_PAGE = {
  ...COMMON,
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-robots-tag": "noindex, nofollow",
  "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate",
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic'; connect-src 'self' https://api.kybr.com.br; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests",
};
const PANEL_PAGE = {
  ...COMMON,
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-robots-tag": "noindex, nofollow",
  "cache-control": "private, no-store",
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic' https://challenges.cloudflare.com; connect-src 'self'; worker-src 'self'; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests",
};

let server: Server | undefined;

type Route = {
  status: number;
  headers?: Record<string, string>;
  body?: string;
};

/**
 * How the fake deployment answers a Server Action POST (M5C-01): "middleware"
 * is ours (411 without Content-Length, 413 over 1 MiB, else the action's
 * own 404 for an unknown id); "length-dropped" is a platform that strips
 * Content-Length; "no-cap" lets any size through.
 */
type Actions = "middleware" | "length-dropped" | "no-cap";

const MIB = 1_048_576;
const CHUNK = "/_next/static/chunks/main-app-abc123.js";
// The no-egress policy next.config.ts sends on /_next/static (Security C3).
const STATIC_CSP = "default-src 'none'; script-src 'self'";
const PAGE_BODY = `<!doctype html><script src="${CHUNK}" async></script>`;

function serve(
  routes: Record<string, Route>,
  actions: Actions = "middleware",
  staticCsp: string | null = STATIC_CSP,
): Promise<string> {
  const all: Record<string, Route> = {
    [CHUNK]: {
      status: 200,
      headers:
        staticCsp === null ? {} : { "content-security-policy": staticCsp },
    },
    ...routes,
  };
  return new Promise((resolveUrl) => {
    server = createServer((req, res) => {
      if (req.method === "POST" && req.headers["next-action"] !== undefined) {
        let bytes = 0;
        req.on("data", (chunk: Buffer) => (bytes += chunk.length));
        req.on("end", () => {
          const declared = req.headers["content-length"];
          const status =
            actions === "length-dropped" || declared === undefined
              ? 411
              : actions === "middleware" && bytes > MIB
                ? 413
                : 404;
          res.writeHead(status);
          res.end();
        });
        return;
      }
      const route = all[(req.url ?? "/").split("?")[0] ?? "/"] ?? {
        status: 404,
      };
      res.writeHead(route.status, route.headers ?? {});
      res.end(req.method === "HEAD" ? undefined : route.body);
    }).listen(0, "127.0.0.1", () => {
      const address = server?.address();
      resolveUrl(
        `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
      );
    });
  });
}

function run(
  base: string,
  env: Record<string, string>,
): Promise<{ status: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn("sh", [SCRIPT, base], {
      env: { ...process.env, ...env },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("close", (status) => done({ status, output }));
  });
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("check-deploy-headers.sh: hosts (T62)", () => {
  it("EXPECT_UNKNOWN_HOST: passes when health answers and every page is a 404", async () => {
    const base = await serve({ "/api/health": { status: 200 } });
    const { status, output } = await run(base, { EXPECT_UNKNOWN_HOST: "true" });

    expect(output).toContain("unknown host");
    expect(status).toBe(0);
  });

  it("EXPECT_UNKNOWN_HOST: fails when the link page answers on that host", async () => {
    const base = await serve({
      "/api/health": { status: 200 },
      "/v/loja-exemplo": { status: 200, headers: LINK_PAGE, body: PAGE_BODY },
    });
    const { status, output } = await run(base, { EXPECT_UNKNOWN_HOST: "true" });

    expect(output).toContain("FAIL");
    expect(status).toBe(1);
  });

  it("PANEL_URL: checks the panel host's headers on /entrar", async () => {
    const link = await serve({
      "/api/health": { status: 200 },
      "/v/loja-exemplo": { status: 200, headers: LINK_PAGE, body: PAGE_BODY },
      "/entrar": { status: 200, headers: PANEL_PAGE },
    });
    const { status, output } = await run(link, { PANEL_URL: link });

    expect(output).toContain("panel");
    expect(status).toBe(0);
  });

  it("PANEL_URL: fails on a cacheable or indexable panel page, or a CSP that lets the browser call the API", async () => {
    const bad = {
      ...PANEL_PAGE,
      "cache-control": "public, max-age=60",
      "x-robots-tag": "",
      "content-security-policy": LINK_PAGE["content-security-policy"],
    };
    const base = await serve({
      "/api/health": { status: 200 },
      "/v/loja-exemplo": { status: 200, headers: LINK_PAGE, body: PAGE_BODY },
      "/entrar": { status: 200, headers: bad },
    });
    const { status, output } = await run(base, { PANEL_URL: base });

    expect(output).toMatch(/private, no-store/);
    expect(output).toMatch(/noindex/);
    expect(output).toMatch(/connect-src/);
    expect(status).toBe(1);
  });

  it("ADR-0012 / C5: fails when the panel's CSP has no worker-src 'self' or lets blob: workers in", async () => {
    for (const csp of [
      PANEL_PAGE["content-security-policy"].replace("worker-src 'self'; ", ""),
      PANEL_PAGE["content-security-policy"].replace(
        "worker-src 'self'",
        "worker-src 'self' blob:",
      ),
    ]) {
      const base = await serve({
        "/api/health": { status: 200 },
        "/v/loja-exemplo": { status: 200, headers: LINK_PAGE, body: PAGE_BODY },
        "/entrar": {
          status: 200,
          headers: { ...PANEL_PAGE, "content-security-policy": csp },
        },
      });
      const { status, output } = await run(base, { PANEL_URL: base });
      expect(output).toMatch(/worker-src/);
      expect(status).toBe(1);
      server?.close();
    }
  });

  it("ADR-0012: fails when the link host's CSP has a worker-src", async () => {
    const base = await serve({
      "/api/health": { status: 200 },
      "/v/loja-exemplo": {
        status: 200,
        headers: {
          ...LINK_PAGE,
          "content-security-policy": `${LINK_PAGE["content-security-policy"]}; worker-src 'self'`,
        },
      },
    });
    const { status, output } = await run(base, {});
    expect(output).toMatch(/link host has a worker-src/);
    expect(status).toBe(1);
  });
});

describe("check-deploy-headers.sh: Server Action body caps and the static CSP (M5C-01)", () => {
  const routes = (): Record<string, Route> => ({
    "/api/health": { status: 200 },
    "/v/loja-exemplo": { status: 200, headers: LINK_PAGE, body: PAGE_BODY },
    "/entrar": { status: 200, headers: PANEL_PAGE },
  });

  it("passes when a small action gets through, 1.5 MB gets 413 (link and panel /fila), and a chunk has the no-egress CSP", async () => {
    const base = await serve(routes());
    const { status, output } = await run(base, { PANEL_URL: base });
    expect(output).toContain("Server Action");
    expect(output).toContain("_next/static");
    expect(status).toBe(0);
  });

  it("fails when the platform drops Content-Length (every action would be a 411)", async () => {
    const base = await serve(routes(), "length-dropped");
    const { status, output } = await run(base, {});
    expect(output).toMatch(/411/);
    expect(status).toBe(1);
  });

  it("fails when a 1.5 MB action body isn't refused with 413", async () => {
    const base = await serve(routes(), "no-cap");
    const { status, output } = await run(base, { PANEL_URL: base });
    expect(output).toMatch(/413/);
    expect(status).toBe(1);
  });

  it("fails when the static chunk has no worker CSP", async () => {
    const base = await serve(routes(), "middleware", null);
    const { status, output } = await run(base, {});
    expect(output).toMatch(/_next\/static/);
    expect(status).toBe(1);
  });
});

