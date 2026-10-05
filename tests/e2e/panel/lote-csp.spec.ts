import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import {
  LINK_URL,
  PANEL_URL,
  createAccount,
  logIn,
  uniqueEmail,
} from "../fixtures/panel-mock.ts";

// T71 (ADR-0012 items 6–7; Security C3, C5): the panel host's policy allows
// same-origin workers on every page; the link host's doesn't; and the worker
// chunk's own response carries a no-egress CSP.

const SENTINEL = "kybr-lote-parser/1";

/**
 * The built worker chunk (the local production build the E2E serves). Until
 * T75 creates the worker from a page, no chunk carries the sentinel; the
 * header rule covers every /_next/static file, so any chunk proves it.
 */
function workerChunk(): string {
  const dir = join(process.cwd(), ".next/static/chunks");
  const files = readdirSync(dir).filter((file) => file.endsWith(".js"));
  const name =
    files.find((file) =>
      readFileSync(join(dir, file), "utf8").includes(SENTINEL),
    ) ?? files[0];
  if (name === undefined) throw new Error("no chunk in .next");
  return `/_next/static/chunks/${name}`;
}

test.describe("Lote CSP @feature-ops-panel @panel-lote", () => {
  test("worker-src 'self' on every panel page (C5); never blob:", async ({
    page,
    request,
  }, testInfo) => {
    const email = uniqueEmail("lote-csp", testInfo);
    await createAccount(request, email, "pago");
    await logIn(page, email);
    for (const path of ["/fila", "/lote", "/entrar", "/comecar"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      const csp = response.headers()["content-security-policy"] ?? "";
      expect(csp, path).toContain("worker-src 'self'");
      expect(csp, path).not.toMatch(/worker-src[^;]*blob:/);
    }
  });

  test("the link host's policy has no worker-src", async ({ request }) => {
    const response = await request.get(`${LINK_URL}/v/loja-exemplo`);
    expect(response.headers()["content-security-policy"]).not.toContain(
      "worker-src",
    );
  });

  test("the worker chunk answers with default-src 'none'; script-src 'self' (C3)", async ({
    request,
  }) => {
    const response = await request.get(workerChunk());
    expect(response.status()).toBe(200);
    expect(response.headers()["content-security-policy"]).toBe(
      "default-src 'none'; script-src 'self'",
    );
    expect(response.headers()["content-type"]).toMatch(/javascript/);
  });

  test("both hosts serve the third-party notice (C12: the minifier drops SheetJS's banner)", async ({
    request,
  }) => {
    for (const origin of [PANEL_URL, LINK_URL]) {
      const response = await request.get(`${origin}/third-party-notices.txt`);
      expect(response.status(), origin).toBe(200);
      expect(await response.text()).toContain(
        "SheetJS Community Edition 0.20.3",
      );
    }
  });
});
