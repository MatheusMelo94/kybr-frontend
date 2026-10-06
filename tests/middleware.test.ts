// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BRAND_FILES } from "@/lib/brand-assets";
import { middleware } from "@/middleware";

// The vitest env: PANEL_HOST app.kybr.test, LINK_HOST kybr.test.
function request(
  path: string,
  init: { host?: string; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { host: init.host ?? "app.kybr.test", ...init.headers },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("middleware: panel concerns (T47)", () => {
  it("overwrites a client-sent x-kybr-panel-path with the external path + query", () => {
    const response = middleware(
      request("/fila/abc?aba=x", {
        headers: {
          "x-kybr-panel-path": "/forjado",
          cookie: "__Host-kybr_session=v",
        },
      }),
    );

    expect(response.headers.get("x-middleware-request-x-kybr-panel-path")).toBe(
      "/fila/abc?aba=x",
    );
    expect(response.headers.get("x-middleware-rewrite")).toMatch(
      /\/painel\/fila\/abc\?aba=x$/,
    );
  });

  it("drops a client-sent x-kybr-panel-path on the link host", () => {
    const response = middleware(
      request("/v/loja-exemplo", {
        host: "kybr.test",
        headers: { "x-kybr-panel-path": "/fila" },
      }),
    );

    expect(
      response.headers.get("x-middleware-request-x-kybr-panel-path"),
    ).toBeNull();
    expect(response.headers.get("x-middleware-override-headers")).not.toContain(
      "x-kybr-panel-path",
    );
  });

  it("redirects on cookie presence only: makes no API call and never reads the value", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const without = middleware(request("/fila?aba=x"));
    const withCookie = middleware(
      request("/fila", { headers: { cookie: "__Host-kybr_session=lixo" } }),
    );

    expect(without.status).toBe(307);
    expect(without.headers.get("location")).toBe(
      "http://app.kybr.test/entrar?volta=%2Ffila%3Faba%3Dx",
    );
    expect(withCookie.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("outside local http, only the __Host- cookie counts (a tossed plain copy doesn't)", () => {
    const response = middleware(
      request("/fila", { headers: { cookie: "kybr_session=jogado" } }),
    );

    expect(response.status).toBe(307);
  });
});

describe("middleware: shared paths (P4-001)", () => {
  for (const host of ["app.kybr.test", "kybr.test"]) {
    it(`any other /brand/ path gets the normal routing and its CSP on ${host} (Security 0001)`, () => {
      for (const path of [
        "/brand/nope",
        "/brand/kybr-icon.svg.bak",
        "/brand/",
      ]) {
        const response = middleware(request(path, { host }));

        expect(
          response.headers.get("x-middleware-rewrite"),
          path,
        ).not.toBeNull();
        expect(response.headers.get("content-security-policy"), path).toContain(
          "default-src",
        );
      }
    });

    it(`passes exactly the three brand files through on ${host}`, () => {
      expect(BRAND_FILES).toEqual([
        "/brand/kybr-icon.svg",
        "/brand/apple-touch-icon.png",
        "/brand/kybr-og-1200x630.png",
      ]);
      for (const path of BRAND_FILES) {
        const response = middleware(request(path, { host }));
        expect(response.headers.get("x-middleware-rewrite"), path).toBeNull();
      }
    });

    it(`passes /brand/kybr-icon.svg through untouched on ${host} (brand B1)`, () => {
      const response = middleware(request("/brand/kybr-icon.svg", { host }));

      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });
  }

  for (const host of ["app.kybr.test", "kybr.test"]) {
    it(`passes /favicon.ico through untouched on ${host}, so public/favicon.ico answers it`, () => {
      const response = middleware(request("/favicon.ico", { host }));

      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });
  }
});

describe("middleware: Server Actions on the link host (action-forwarding loop)", () => {
  const action = (path: string, accept: string) =>
    new NextRequest(`http://localhost:3000${path}`, {
      method: "POST",
      headers: {
        host: "kybr.test",
        "next-action": "40c0cdc082a5712b05ef1d53a1fa2ee96d4ccc7b9f",
        "content-length": "2",
        accept,
      },
    });

  for (const accept of ["text/x-component", "text/html", "*/*"]) {
    it(`a POST with next-action off /v/* is a plain 404 (Accept: ${accept})`, () => {
      for (const path of [
        "/entrar",
        "/painel/entrar",
        "/_kybr/nao-encontrado",
      ]) {
        const response = middleware(action(path, accept));
        expect(response.status).toBe(404);
        expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      }
    });
  }

  it("a POST with next-action on /v/* goes on (the link's own actions)", () => {
    const response = middleware(action("/v/loja-exemplo", "text/x-component"));
    expect(response.status).not.toBe(404);
  });
});

describe("middleware: Next's action forwarding never chains (HIGH, branch-introduced)", () => {
  const post = (
    path: string,
    host: string,
    headers: Record<string, string> = {},
  ) =>
    new NextRequest(`http://localhost:3000${path}`, {
      method: "POST",
      // Browsers always send an action's Content-Length (C1 answers 411 without).
      headers: { host, accept: "text/html", "content-length": "2", ...headers },
    });

  for (const host of ["app.kybr.test", "kybr.test", "evil.example"])
    for (const path of [
      "/entrar",
      "/v/loja-exemplo",
      "/painel/entrar",
      "/api/health",
    ])
      it(`a forwarded action (x-action-forwarded) is a plain 404 on ${host}${path}`, () => {
        const response = middleware(
          post(path, host, {
            "next-action": "40c0cdc082a5712b05ef1d53a1fa2ee96d4ccc7b9f",
            "x-action-forwarded": "1",
          }),
        );
        expect(response.status).toBe(404);
        expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      });

  it("the panel host refuses next-action on a /painel path (never an external one)", () => {
    for (const path of ["/painel", "/painel/entrar", "/painel/painel/x"]) {
      const response = middleware(
        post(path, "app.kybr.test", { "next-action": "ab".repeat(21) }),
      );
      expect(response.status).toBe(404);
    }
  });

  it("the panel host still routes its own actions on external paths", () => {
    const response = middleware(
      post("/entrar", "app.kybr.test", { "next-action": "ab".repeat(21) }),
    );
    expect(response.status).not.toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toMatch(
      /\/painel\/entrar$/,
    );
  });
});

describe("middleware: Lote's worker in the CSP (ADR-0012 item 7, Security C5)", () => {
  it.each(["/fila", "/lote", "/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", "/entrar", "/comecar"])(
    "every panel-host page allows same-origin workers: %s",
    (path) => {
      const response = middleware(
        request(path, { headers: { cookie: "__Host-kybr_session=v" } }),
      );
      expect(response.headers.get("content-security-policy")).toContain(
        "worker-src 'self';",
      );
    },
  );

  it("the link host never does", () => {
    const response = middleware(request("/v/loja-exemplo", { host: "kybr.test" }));
    expect(response.headers.get("content-security-policy")).not.toContain(
      "worker-src",
    );
  });
});

describe("middleware: the third-party notice (Security C12)", () => {
  for (const host of ["app.kybr.test", "kybr.test"])
    it(`passes /third-party-notices.txt through untouched on ${host}`, () => {
      const response = middleware(request("/third-party-notices.txt", { host }));
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    });
});

describe("middleware: Server Action body size (Security C1)", () => {
  const MiB = 1024 * 1024;
  function action(path: string, host: string, length: number | undefined) {
    return new NextRequest(`http://localhost:3000${path}`, {
      method: "POST",
      headers: {
        host,
        "next-action": "40c0cdc082a5712b05ef1d53a1fa2ee96d4ccc7b9f",
        accept: "text/x-component",
        cookie: "__Host-kybr_session=v",
        ...(length !== undefined && { "content-length": String(length) }),
      },
    });
  }

  it.each([
    ["/fila", "app.kybr.test"],
    ["/entrar", "app.kybr.test"],
    ["/lote/", "app.kybr.test"],
    ["/LOTE", "app.kybr.test"],
    ["/painel/lote", "app.kybr.test"],
    ["/lote/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b", "app.kybr.test"],
    ["/v/loja-exemplo", "kybr.test"],
    ["/lote", "kybr.test"],
  ])("over 1 MiB to %s on %s → 413", (path, host) => {
    expect(middleware(action(path, host, MiB + 1)).status).toBe(413);
  });

  it("1 MiB exactly passes to /fila", () => {
    expect(middleware(action("/fila", "app.kybr.test", MiB)).status).not.toBe(413);
  });

  it("the panel host's /lote, exactly, may carry more (startBatchAction; Next's 2.5 MB limit is its backstop)", () => {
    const response = middleware(
      action("/lote", "app.kybr.test", Math.floor(2.4 * MiB)),
    );
    expect(response.status).not.toBe(413);
    expect(response.headers.get("x-middleware-rewrite")).toMatch(/\/painel\/lote$/);
  });

  it.each([
    ["/fila", "app.kybr.test"],
    ["/lote", "app.kybr.test"],
    ["/v/loja-exemplo", "kybr.test"],
  ])("a Server Action without Content-Length to %s → 411", (path, host) => {
    expect(middleware(action(path, host, undefined)).status).toBe(411);
  });

  it("a plain POST (no next-action) isn't capped here", () => {
    const request = new NextRequest("http://localhost:3000/api/csp-report", {
      method: "POST",
      headers: { host: "app.kybr.test", "content-length": String(2 * MiB) },
    });
    expect(middleware(request).status).not.toBe(413);
  });
});
