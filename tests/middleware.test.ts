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
