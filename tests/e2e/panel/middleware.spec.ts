import { request as httpRequest } from "node:http";

import { expect, test } from "@playwright/test";

// ADR-0008 rule 9, ADR-0009 rule 6: what middleware adds for the panel host.
// Routing and UX only: the DAL re-checks everything.

const PANEL_HOST = "127.0.0.1:3000";
const TURNSTILE = "https://challenges.cloudflare.com";

type Raw = { status: number; headers: Record<string, string> };

function rawGet(
  path: string,
  headers: Record<string, string> = {},
  host = PANEL_HOST,
): Promise<Raw> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port: 3000,
        path,
        method: "GET",
        headers: { ...headers, host },
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [k, String(v)]),
            ),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function directive(
  policy: string | undefined,
  name: string,
): string | undefined {
  return policy
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
}

test.describe("panel middleware @feature-ops-panel @panel-access", () => {
  test("no session cookie + a protected path → 307 to /entrar with volta", async () => {
    const response = await rawGet("/fila?aba=x");

    expect(response.status).toBe(307);
    // Next relativizes a same-host Location; either form lands on the panel host.
    expect(response.headers.location).toMatch(
      /^(http:\/\/127\.0\.0\.1:3000)?\/entrar\?volta=%2Ffila%3Faba%3Dx$/,
    );
  });

  for (const path of ["/", "/comecar", "/fila"]) {
    test(`${path} without a cookie redirects too`, async () => {
      const response = await rawGet(path);
      expect(response.status).toBe(307);
      expect(response.headers.location).toMatch(/\/entrar\?volta=/);
    });
  }

  test("an unknown path isn't redirected: the panel's not-found answers it (AC 13)", async () => {
    const response = await rawGet("/qualquer");
    expect(response.status).toBe(404);
    expect(response.headers.location).toBeUndefined();
  });

  test("a session cookie's presence lets the request through: the DAL checks it", async () => {
    const response = await rawGet("/fila", {
      cookie: "kybr_session=qualquer-valor-0123456789",
    });
    // Not middleware's redirect (?volta=): the DAL rejected the bogus session.
    expect(response.headers.location ?? "").toMatch(/\/entrar\?motivo=sessao/);
  });

  for (const path of [
    "/entrar",
    "/cadastro",
    "/cadastro/confirmar",
    "/senha/esqueci",
    "/senha/nova",
  ]) {
    test(`${path} is never sent to /entrar, cookie or not`, async () => {
      for (const headers of [
        {},
        { cookie: "kybr_session=qualquer-valor-0123456789" },
      ]) {
        // A page may redirect on its own (S2 without a pending sign-up goes
        // to /cadastro); middleware never sends an auth page to /entrar.
        const response = await rawGet(path, headers);
        expect(response.headers.location ?? "").not.toMatch(/\/entrar/);
      }
    });
  }

  test("panel responses are private, no-store and noindex; connect-src is 'self' only", async () => {
    const response = await rawGet("/entrar");
    const csp = response.headers["content-security-policy"];

    expect(response.headers["cache-control"]).toMatch(/\bprivate\b/);
    expect(response.headers["cache-control"]).toMatch(/\bno-store\b/);
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(response.headers["reporting-endpoints"]).toBe(
      `csp="http://${PANEL_HOST}/api/csp-report"`,
    );
  });

  for (const path of [
    "/entrar",
    "/cadastro",
    "/cadastro/confirmar",
    "/senha/esqueci",
  ]) {
    test(`${path} allows Turnstile in script-src and frame-src`, async () => {
      const csp = (await rawGet(path)).headers["content-security-policy"];

      expect(directive(csp, "script-src")).toContain(TURNSTILE);
      expect(directive(csp, "frame-src")).toBe(`frame-src ${TURNSTILE}`);
    });
  }

  for (const path of ["/senha/nova", "/fila", "/qualquer"]) {
    test(`${path} allows no Turnstile origin`, async () => {
      const csp = (
        await rawGet(path, { cookie: "kybr_session=qualquer-valor-0123456789" })
      ).headers["content-security-policy"];

      expect(csp).toBeDefined();
      expect(csp).not.toContain(TURNSTILE);
    });
  }

  for (const path of ["/senha/esqueci", "/senha/nova"]) {
    test(`${path} sends Referrer-Policy: no-referrer`, async () => {
      expect((await rawGet(path)).headers["referrer-policy"]).toBe(
        "no-referrer",
      );
    });
  }

  test("/entrar keeps the default Referrer-Policy", async () => {
    expect((await rawGet("/entrar")).headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  test("the link host keeps its headers: no panel CSP, cache or robots change", async () => {
    const response = await rawGet("/v/loja-exemplo", {}, "localhost:3000");
    const csp = response.headers["content-security-policy"];

    expect(directive(csp, "connect-src")).toBe(
      "connect-src 'self' http://localhost:4010",
    );
    expect(csp).not.toContain(TURNSTILE);
    expect(response.headers["cache-control"]).not.toBe("private, no-store");
  });
});
