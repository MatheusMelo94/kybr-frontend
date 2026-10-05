// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

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
      headers: { host, accept: "text/html", ...headers },
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
