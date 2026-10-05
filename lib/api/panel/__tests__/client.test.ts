// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AppError } from "@/lib/api/errors";
import { panelRequest } from "@/lib/api/panel/client";
import { server } from "@/tests/fixtures/msw/server";

const API = "http://api.kybr.test"; // API_BASE_URL in vitest.config.mts
const BFF_KEY = "test-only-bff-key-0123456789abcdef";
const TOKEN = "sessao-sintetica-0123456789abcdefghij";

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("@/lib/monitoring", () => ({ reportMarker: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));

const meSchema = z.object({ nome: z.string() });

type Seen = { headers?: Headers; url?: string; cache?: string };

function capture(path = "/v1/me", status = 200): Seen {
  const seen: Seen = {};
  server.use(
    http.all(`${API}${path}`, ({ request }) => {
      seen.headers = request.headers;
      seen.url = request.url;
      return status === 200
        ? HttpResponse.json({ nome: "Pessoa Exemplo" })
        : HttpResponse.json(
            { code: "SESSAO_EXPIRADA", message: "MSG-BACKEND-NAO-EXIBIR" },
            { status, headers: { "X-Request-Id": "req-1" } },
          );
    }),
  );
  return seen;
}

beforeEach(() => {
  requestHeaders.value = new Headers({ "x-forwarded-for": "203.0.113.9" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("panelRequest (ADR-0009 rule 4, P18)", () => {
  it("returns the parsed body", async () => {
    capture();
    const result = await panelRequest({
      operation: "me",
      path: "/v1/me",
      schema: meSchema,
      sessionToken: TOKEN,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { nome: "Pessoa Exemplo" },
    });
  });

  it("sends the bearer session, the BFF key and the client IP when asked", async () => {
    const seen = capture();
    await panelRequest({
      operation: "me",
      path: "/v1/me",
      schema: meSchema,
      sessionToken: TOKEN,
      forwardClientIp: true,
    });

    expect(seen.headers?.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(seen.headers?.get("x-kybr-bff-key")).toBe(BFF_KEY);
    expect(seen.headers?.get("x-kybr-client-ip")).toBe("203.0.113.9");
  });

  it("sends no Authorization header without a token, and no client IP unless asked", async () => {
    const seen = capture("/v1/auth/login");
    await panelRequest({
      operation: "login",
      path: "/v1/auth/login",
      method: "POST",
      body: {},
      schema: meSchema,
    });

    expect(seen.headers?.has("authorization")).toBe(false);
    expect(seen.headers?.get("x-kybr-bff-key")).toBe(BFF_KEY);
    expect(seen.headers?.has("x-kybr-client-ip")).toBe(false);
  });

  it("forces cache: 'no-store' and redirect: 'error' whatever the caller passes (P06)", async () => {
    capture();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await panelRequest({
      operation: "me",
      path: "/v1/me",
      schema: meSchema,
      sessionToken: TOKEN,
      // A caller can't opt into caching, even by smuggling it in.
      ...({ cache: "force-cache", next: { revalidate: 60 } } as object),
    });

    const init = fetchSpy.mock.calls[0]?.[1];
    expect(init?.cache).toBe("no-store");
    expect(init?.next).toBeUndefined();
    expect(init?.redirect).toBe("error");
  });

  it("maps any 401 to SESSAO_EXPIRADA, never reading the message", async () => {
    capture("/v1/me", 401);
    const result = await panelRequest({
      operation: "me",
      path: "/v1/me",
      schema: meSchema,
      sessionToken: TOKEN,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(AppError);
    expect(result.error.code).toBe("SESSAO_EXPIRADA");
    expect(result.error.requestId).toBe("req-1");
    expect(result.error.message).not.toContain("MSG-BACKEND");
  });

  it("keeps a pre-session 401's own code (login's CREDENCIAIS_INVALIDAS)", async () => {
    server.use(
      http.post(`${API}/v1/auth/login`, () =>
        HttpResponse.json(
          { code: "CREDENCIAIS_INVALIDAS", message: "x" },
          { status: 401 },
        ),
      ),
    );
    const result = await panelRequest({
      operation: "login",
      path: "/v1/auth/login",
      method: "POST",
      body: {},
      schema: meSchema,
    });

    expect(result.ok ? undefined : result.error.code).toBe(
      "CREDENCIAIS_INVALIDAS",
    );
  });

  it.each([
    "CREDENCIAIS_INVALIDAS",
    "EMAIL_NAO_CONFIRMADO",
    "EMAIL_EM_USO",
    "SENHA_FRACA",
    "VALOR_INVALIDO",
    "CODIGO_INCORRETO",
    "CODIGO_EXPIRADO",
    "TOKEN_INVALIDO",
    "TURNSTILE_REQUERIDO",
    "TURNSTILE_INVALIDO",
    "TESTE_INDISPONIVEL",
    "TESTE_PAUSADO",
    "LIMITE_TENTATIVAS",
  ])("recognizes the panel code %s (A-X2)", async (code) => {
    server.use(
      http.post(`${API}/v1/auth/login`, () =>
        HttpResponse.json({ code, message: "x" }, { status: 400 }),
      ),
    );
    const result = await panelRequest({
      operation: "login",
      path: "/v1/auth/login",
      method: "POST",
      body: {},
      schema: meSchema,
    });

    expect(result.ok ? undefined : result.error.code).toBe(code);
  });

  it("never logs the Authorization header or the token", async () => {
    server.use(
      http.get(`${API}/v1/me`, () => HttpResponse.json({ unexpected: true })),
    );
    const logged: unknown[] = [];
    for (const method of ["error", "warn", "log", "info"] as const)
      vi.spyOn(console, method).mockImplementation((...args) => {
        logged.push(args);
      });

    await panelRequest({
      operation: "me",
      path: "/v1/me",
      schema: meSchema,
      sessionToken: TOKEN,
    });

    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify(logged)).not.toContain(TOKEN);
    expect(JSON.stringify(logged).toLowerCase()).not.toContain("authorization");
  });

  it.each([
    "/public/v/loja",
    "/v1/public/x",
    "/v1/%2e%2e/public/x",
    "/v1/../public/x",
    "/v2/me",
    "/v1",
    "/v1//me",
    "//evil.example/v1/me",
    "https://evil.example/v1/me",
    "http://user@evil.example/v1/me",
  ])(
    "refuses the path %s: only the API's /v1/ tree, never /v1/public/",
    async (path) => {
      await expect(
        panelRequest({ operation: "probe", path, schema: meSchema }),
      ).rejects.toThrow(/Refused/);
    },
  );
});

describe("no cross-request cache anywhere in the panel (P06)", () => {
  const ROOT = resolve(__dirname, "../../../..");
  const DIRS = ["app/(panel)", "lib/api/panel"];

  function files(): string[] {
    const panelFeatures = readdirSync(join(ROOT, "features"))
      .filter((name) => name.startsWith("panel-"))
      .map((name) => `features/${name}`);
    return [...DIRS, ...panelFeatures].flatMap((dir) =>
      readdirSync(join(ROOT, dir), { recursive: true })
        .map(String)
        .filter(
          (file) => /\.(ts|tsx)$/.test(file) && !file.includes("__tests__"),
        )
        .map((file) => join(dir, file)),
    );
  }

  it("has no revalidate option, unstable_cache or 'use cache'", () => {
    const offenders = files().filter((file) =>
      /\brevalidate\s*[:=]|unstable_cache|["']use cache["']/.test(
        readFileSync(join(ROOT, file), "utf8"),
      ),
    );

    expect(offenders).toEqual([]);
  });
});
