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
    "default-src 'self'; script-src 'self' 'nonce-abc' 'strict-dynamic' https://challenges.cloudflare.com; connect-src 'self'; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; object-src 'none'; upgrade-insecure-requests",
};

let server: Server | undefined;

function serve(
  routes: Record<string, { status: number; headers?: Record<string, string> }>,
): Promise<string> {
  return new Promise((resolveUrl) => {
    server = createServer((req, res) => {
      const route = routes[(req.url ?? "/").split("?")[0] ?? "/"] ?? {
        status: 404,
      };
      res.writeHead(route.status, route.headers ?? {});
      res.end();
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
      "/v/loja-exemplo": { status: 200, headers: LINK_PAGE },
    });
    const { status, output } = await run(base, { EXPECT_UNKNOWN_HOST: "true" });

    expect(output).toContain("FAIL");
    expect(status).toBe(1);
  });

  it("PANEL_URL: checks the panel host's headers on /entrar", async () => {
    const link = await serve({
      "/api/health": { status: 200 },
      "/v/loja-exemplo": { status: 200, headers: LINK_PAGE },
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
      "/v/loja-exemplo": { status: 200, headers: LINK_PAGE },
      "/entrar": { status: 200, headers: bad },
    });
    const { status, output } = await run(base, { PANEL_URL: base });

    expect(output).toMatch(/private, no-store/);
    expect(output).toMatch(/noindex/);
    expect(output).toMatch(/connect-src/);
    expect(status).toBe(1);
  });
});
