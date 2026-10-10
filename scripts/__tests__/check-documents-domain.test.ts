// @vitest-environment node
import { execFileSync, spawn } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// T116, Security F3: the documents-domain gate. A staging signed URL for a
// PDF and one for a PNG must carry the D-C6 headers before
// PANEL_DOCUMENTS_MODE=redirect ships to Production.

const SCRIPT = resolve(__dirname, "../check-documents-domain.sh");

const COMMON: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "sandbox; default-src 'none'",
  "cache-control": "private, no-store",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
};
const PDF: Record<string, string> = {
  ...COMMON,
  "content-type": "application/pdf",
  "content-disposition": 'inline; filename="documento.pdf"',
};
const PNG: Record<string, string> = {
  ...COMMON,
  "content-type": "image/png",
  "content-disposition": 'inline; filename="documento.png"',
};
// The signature is a bearer credential: the script must never print it.
const SIG = "sig=s3cr3t-signature-value";

let server: Server | undefined;

function serve(
  routes: Record<string, { status?: number; headers: Record<string, string> }>,
): Promise<string> {
  return new Promise((resolveUrl) => {
    server = createServer((req, res) => {
      const route = routes[(req.url ?? "/").split("?")[0] ?? "/"];
      res.writeHead(route?.status ?? (route ? 200 : 404), route?.headers ?? {});
      res.end(req.method === "HEAD" ? undefined : "%PDF-1.4");
    }).listen(0, "127.0.0.1", () => {
      const address = server?.address();
      resolveUrl(
        `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`,
      );
    });
  });
}

/** Runs the script with the URLs on stdin, one per line (M6C-09), never argv. */
function run(
  urls: string[],
  env: Record<string, string> = { API_ALLOW_LOOPBACK_HTTP: "true" },
  args: string[] = [],
): Promise<{ status: number | null; output: string }> {
  return new Promise((done) => {
    const child = spawn("sh", [SCRIPT, ...args], {
      env: { ...process.env, ...env },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.on("close", (status) => done({ status, output }));
    // A refusal exits before it reads stdin; the pending write then gets EPIPE (QA-M6-001).
    child.stdin.on("error", () => {});
    child.stdin.end(urls.map((url) => `${url}\n`).join(""));
  });
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("check-documents-domain.sh (T116, Security F3)", () => {
  it("passes on the D-C6 headers and prints the timestamp to record, never the URLs", async () => {
    const base = await serve({
      "/__docs/pdf": { headers: PDF },
      "/__docs/png": { headers: PNG },
    });
    const { status, output } = await run([
      `${base}/__docs/pdf?${SIG}`,
      `${base}/__docs/png?${SIG}`,
    ]);

    expect(output).toContain("PASSED");
    expect(output).toMatch(
      /DOCUMENTS_DOMAIN_CHECKED_AT=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/,
    );
    expect(output).toContain(base);
    expect(output).not.toContain("s3cr3t");
    expect(output).not.toContain("/__docs/");
    expect(status).toBe(0);
  });

  it.each([
    "x-content-type-options",
    "content-security-policy",
    "content-disposition",
    "cache-control",
    "cross-origin-resource-policy",
    "referrer-policy",
    "content-type",
  ])("fails when the PDF lacks %s", async (header) => {
    const headers = { ...PDF };
    delete headers[header];
    const base = await serve({
      "/__docs/pdf": { headers },
      "/__docs/png": { headers: PNG },
    });
    const { status, output } = await run([
      `${base}/__docs/pdf?${SIG}`,
      `${base}/__docs/png?${SIG}`,
    ]);

    expect(output).toMatch(new RegExp(`FAIL: PDF: .*${header}`, "i"));
    expect(output).not.toContain("DOCUMENTS_DOMAIN_CHECKED_AT=");
    expect(output).not.toContain("s3cr3t");
    expect(status).toBe(1);
  });

  it.each([
    [
      "a CSP without sandbox",
      { "content-security-policy": "default-src 'none'" },
    ],
    [
      "a CSP without default-src 'none'",
      { "content-security-policy": "sandbox" },
    ],
    ["a shared-cacheable response", { "cache-control": "public, max-age=60" }],
    ["a cross-origin CORP", { "cross-origin-resource-policy": "cross-origin" }],
    [
      "a Referer-leaking policy",
      { "referrer-policy": "strict-origin-when-cross-origin" },
    ],
    [
      "the uploader's file name",
      { "content-disposition": 'inline; filename="RG da Maria (1).pdf"' },
    ],
    ["no file name", { "content-disposition": "inline" }],
    ["the wrong type", { "content-type": "text/html" }],
  ])("fails on %s", async (_name, override) => {
    const base = await serve({
      "/__docs/pdf": { headers: { ...PDF, ...override } },
      "/__docs/png": { headers: PNG },
    });
    const { status, output } = await run([
      `${base}/__docs/pdf?${SIG}`,
      `${base}/__docs/png?${SIG}`,
    ]);
    expect(output).toContain("FAIL: PDF:");
    expect(status).toBe(1);
  });

  it("checks the PNG's type too", async () => {
    const base = await serve({
      "/__docs/pdf": { headers: PDF },
      "/__docs/png": { headers: { ...PNG, "content-type": "application/pdf" } },
    });
    const { status, output } = await run([
      `${base}/__docs/pdf?${SIG}`,
      `${base}/__docs/png?${SIG}`,
    ]);
    expect(output).toMatch(/FAIL: PNG: .*image\/png/);
    expect(status).toBe(1);
  });

  it("fails on a non-200 (an expired or wrong signature)", async () => {
    const base = await serve({
      "/__docs/pdf": { status: 403, headers: PDF },
      "/__docs/png": { headers: PNG },
    });
    const { status, output } = await run([
      `${base}/__docs/pdf?${SIG}`,
      `${base}/__docs/png?${SIG}`,
    ]);
    expect(output).toMatch(/FAIL: PDF: .*403/);
    expect(status).toBe(1);
  });

  it("refuses http: unless API_ALLOW_LOOPBACK_HTTP=true on loopback (QA Q1)", async () => {
    const base = await serve({
      "/__docs/pdf": { headers: PDF },
      "/__docs/png": { headers: PNG },
    });
    const { status, output } = await run(
      [`${base}/__docs/pdf?${SIG}`, `${base}/__docs/png?${SIG}`],
      {},
    );
    expect(output).toMatch(/https:/);
    expect(status).toBe(1);
  });

  it.each([
    "https://docs.kybr.com.br/x?sig=1",
    "https://kybr.com.br/x?sig=1",
    "https://DOCS.Kybr.Com.Br./x?sig=1",
  ])(
    "refuses a documents host under kybr.com.br without fetching: %s",
    async (url) => {
      const { status, output } = await run([url, url]);
      expect(output).toMatch(/registrable domain/);
      expect(status).toBe(1);
    },
  );

  it("refuses two URLs on different origins, or off DOCUMENTS_ORIGIN when set", async () => {
    const base = await serve({
      "/__docs/pdf": { headers: PDF },
      "/__docs/png": { headers: PNG },
    });
    const other = base.replace("127.0.0.1", "localhost");
    const split = await run([`${base}/__docs/pdf`, `${other}/__docs/png`]);
    expect(split.output).toMatch(/same origin/);
    expect(split.status).toBe(1);

    const off = await run([`${base}/__docs/pdf`, `${base}/__docs/png`], {
      API_ALLOW_LOOPBACK_HTTP: "true",
      DOCUMENTS_ORIGIN: "https://docs.kybr-arquivos.example",
    });
    expect(off.output).toMatch(/DOCUMENTS_ORIGIN/);
    expect(off.status).toBe(1);
  });

  it("prints its usage without two URLs on stdin", async () => {
    const none = await run([]);
    expect(none.output).toMatch(/Usage/);
    expect(none.status).toBe(2);

    const one = await run([`https://docs.exemplo.test/pdf?${SIG}`]);
    expect(one.output).toMatch(/Usage/);
    expect(one.status).toBe(2);
  });

  it("M6C-09: refuses URLs as arguments (shell history, ps) without echoing them", async () => {
    const url = `https://docs.exemplo.test/pdf?${SIG}`;
    const { status, output } = await run([], undefined, [url, url]);
    expect(output).toMatch(/Usage/);
    expect(output).toMatch(/stdin/);
    expect(output).not.toContain("s3cr3t");
    expect(status).toBe(2);
  });

  it("M6C-09 / QA-M6-001: a refusal that never reads stdin doesn't crash the run with EPIPE", async () => {
    // More than a pipe buffer (64 KiB), so the write is still pending when the script exits.
    const urls = Array.from(
      { length: 4000 },
      (_, i) => `https://docs.exemplo.test/${i}?${SIG}`,
    );
    const { status } = await run(urls, undefined, ["--"]);
    expect(status).toBe(2);
  });

  it("M6C-09: reads CRLF lines and passes the URLs to node and curl off their argv", async () => {
    const base = await serve({
      "/__docs/pdf": { headers: PDF },
      "/__docs/png": { headers: PNG },
    });
    // Shims record every argv node and curl get, then run the real binary.
    const bin = mkdtempSync(join(tmpdir(), "f3-argv-"));
    const log = join(bin, "argv.log");
    for (const [name, real] of [
      ["node", process.execPath],
      ["curl", execFileSync("sh", ["-c", "command -v curl"]).toString().trim()],
    ] as const) {
      writeFileSync(
        join(bin, name),
        `#!/bin/sh\nprintf '%s\\n' "${name} $*" >> "${log}"\nexec "${real}" "$@"\n`,
      );
      chmodSync(join(bin, name), 0o755);
    }
    try {
      const { status, output } = await run(
        [`${base}/__docs/pdf?${SIG}\r`, `${base}/__docs/png?${SIG}\r`],
        { API_ALLOW_LOOPBACK_HTTP: "true", PATH: `${bin}:${process.env.PATH}` },
      );
      expect(output).toContain("PASSED");
      expect(status).toBe(0);
      const argv = readFileSync(log, "utf8");
      expect(argv).toMatch(/^curl /m);
      expect(argv).toMatch(/^node /m);
      expect(argv).not.toContain("s3cr3t");
      expect(argv).not.toContain("/__docs/");
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  });
});
