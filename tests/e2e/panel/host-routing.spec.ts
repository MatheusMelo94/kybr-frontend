import { request as httpRequest } from "node:http";

import { expect, test } from "@playwright/test";

// ADR-0008: one app, two hosts. In E2E the panel host is 127.0.0.1:3000 (this
// project's baseURL) and the link host is localhost:3000 (playwright.config.ts).

const LINK = "http://localhost:3000";
const PANEL_404 = "Página não encontrada";
const LINK_404 = "Link não encontrado";
// Protected panel paths need a session cookie's presence to get past
// middleware (T47); these routes don't read it yet.
const SESSION_COOKIE = "kybr_session=presenca-somente-0123456789";

type RawResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

/** A GET with a Host header Playwright's request context won't let us forge. */
function rawGet(
  path: string,
  host: string,
  headers: Record<string, string> = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: 3000,
        path,
        method: "GET",
        headers: { cookie: SESSION_COOKIE, ...headers, host },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [k, String(v)]),
            ),
            body,
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

test.describe("host routing @feature-ops-panel @panel-access", () => {
  test.beforeEach(async ({ context }) => {
    const [name = "", value = ""] = SESSION_COOKIE.split("=");
    await context.addCookies([{ name, value, url: "http://127.0.0.1:3000" }]);
  });

  test("the panel host serves the panel at / and at unknown paths", async ({
    page,
  }) => {
    const home = await page.goto("/");
    expect(home?.status()).toBe(200);
    await expect(page.getByText(LINK_404)).toHaveCount(0);

    const unknown = await page.goto("/qualquer-coisa");
    expect(unknown?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { level: 1, name: PANEL_404 }),
    ).toBeVisible();
  });

  for (const path of [
    "/painel/x",
    "/painel",
    "/v/loja-exemplo",
  ]) {
    test(`the panel host answers ${path} with the panel's not-found`, async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: PANEL_404 }),
      ).toBeVisible();
      await expect(page.getByText(LINK_404)).toHaveCount(0);
    });
  }

  test("both hosts serve the Kybr icons, cached, and /entrar logs no console error (P4-001, AC 41 / 75)", async ({
    page,
  }) => {
    for (const host of ["127.0.0.1:3000", "localhost:3000"])
      for (const path of [
        "/favicon.ico",
        "/brand/kybr-icon.svg",
        "/brand/apple-touch-icon.png",
      ]) {
        const response = await rawGet(path, host);
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toContain("max-age=86400");
      }

    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/entrar");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);

    // The share image: the panel's, absolute on the panel host (AC 75).
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      "http://127.0.0.1:3000/brand/kybr-og-1200x630.png",
    );
    const image = await page.request.get("/brand/kybr-og-1200x630.png");
    expect(image.status()).toBe(200);
    expect((await image.body()).length).toBeLessThanOrEqual(80 * 1024);
  });

  test("the link host still serves /v/*", async ({ page }) => {
    const response = await page.goto(`${LINK}/v/loja-exemplo`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: "Cadastro de vendedor" }),
    ).toBeVisible();
  });

  for (const path of ["/", "/fila", "/entrar", "/painel/fila", "/painel"]) {
    test(`the link host answers ${path} with the link's not-found`, async ({
      page,
    }) => {
      const response = await page.goto(`${LINK}${path}`);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { level: 1, name: LINK_404 }),
      ).toBeVisible();
    });
  }

  for (const path of [
    "/",
    "/v/loja-exemplo",
    "/entrar",
    "/api/csp-report",
    "/favicon.ico",
  ]) {
    test(`an unknown host gets 404 on ${path} (P03.1)`, async () => {
      const response = await rawGet(path, "evil.example");
      expect(response.status).toBe(404);
      expect(response.body).not.toContain("Cadastro de vendedor");
    });
  }

  for (const host of ["evil.example", "127.0.0.1:3000", "localhost:3000"]) {
    test(`/api/health answers on ${host}`, async () => {
      const response = await rawGet("/api/health", host);
      expect(response.status).toBe(200);
    });
  }

  // Middleware can't see Next's flight headers (it strips them first), so the
  // nonce work runs on prefetches too; what matters is that routing does.
  test("a prefetch is host-routed too (P03.1)", async () => {
    // A prefetch renders a partial tree (200 even for a not-found page), so
    // the proof is where middleware sent it.
    const prefetch = { rsc: "1", "next-router-prefetch": "1" };
    const routed = async (path: string, host: string): Promise<RawResponse> =>
      rawGet(path, host, prefetch);

    const panelHome = await routed("/", "127.0.0.1:3000");
    expect(panelHome.headers["x-nextjs-rewritten-path"]).toBe("/painel");

    const panelFila = await routed("/fila", "127.0.0.1:3000");
    expect(panelFila.headers["x-nextjs-rewritten-path"]).toBe("/painel/fila");

    const panelLink = await routed("/v/loja-exemplo", "127.0.0.1:3000");
    expect(panelLink.headers["x-nextjs-rewritten-path"]).toBe(
      "/painel/v/loja-exemplo",
    );
    expect(panelLink.body).not.toContain("Cadastro de vendedor");

    const linkHome = await routed("/", "localhost:3000");
    expect(linkHome.headers["x-nextjs-rewritten-path"]).not.toMatch(
      /^\/painel/,
    );
    expect(linkHome.body).not.toContain(PANEL_404);

    const linkPanelPath = await routed("/painel/fila", "localhost:3000");
    expect(linkPanelPath.headers["x-nextjs-rewritten-path"]).not.toMatch(
      /^\/painel/,
    );

    expect((await routed("/", "evil.example")).status).toBe(404);
  });

  test("the link host answers a Flight request off /v/* with a plain 404", async () => {
    const response = await rawGet("/fila", "localhost:3000", {
      accept: "text/x-component",
    });
    expect(response.status).toBe(404);
    expect(response.body).toBe("");
  });
});
