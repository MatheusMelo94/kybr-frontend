// @vitest-environment node
import { delay, http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { apiRequest } from "@/lib/api/client";
import { parseClientIp } from "@/lib/api/client-ip";
import { AppError } from "@/lib/api/errors";
import { server } from "@/tests/fixtures/msw/server";

const API = "http://api.kybr.test"; // API_BASE_URL in vitest.config.mts
const BFF_KEY = "test-only-bff-key-0123456789abcdef";
const SENTINEL = "MSG-BACKEND-NAO-EXIBIR";

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));

const companySchema = z.object({ razao_social: z.string() });

function capture(): { headers?: Headers; body?: string; url?: string } {
  const seen: { headers?: Headers; body?: string; url?: string } = {};
  server.use(
    http.all(`${API}/probe`, async ({ request }) => {
      seen.headers = request.headers;
      seen.url = request.url;
      seen.body = await request.text();
      return HttpResponse.json({ razao_social: "Exemplo Ltda." });
    }),
  );
  return seen;
}

function respond(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  server.use(
    http.get(`${API}/probe`, () =>
      HttpResponse.json(body as Record<string, unknown>, { status, headers }),
    ),
  );
}

async function failure(): Promise<AppError> {
  const result = await apiRequest({
    operation: "probe",
    path: "/probe",
    schema: companySchema,
  });
  if (result.ok) throw new Error("expected a failure");
  return result.error;
}

beforeEach(() => {
  requestHeaders.value = new Headers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiRequest", () => {
  it("returns the parsed body and the request id on success", async () => {
    respond(
      200,
      { razao_social: "Exemplo Ltda.", extra: "dropped" },
      { "X-Request-Id": "req-1" },
    );

    const result = await apiRequest({
      operation: "probe",
      path: "/probe",
      schema: companySchema,
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { razao_social: "Exemplo Ltda." },
      requestId: "req-1",
    });
  });

  it("calls API_BASE_URL and always sends the BFF key", async () => {
    const seen = capture();

    await apiRequest({
      operation: "probe",
      path: "/probe",
      schema: companySchema,
    });

    expect(seen.url).toBe(`${API}/probe`);
    expect(seen.headers?.get("x-kybr-bff-key")).toBe(BFF_KEY);
  });

  it("sends no client IP unless asked", async () => {
    requestHeaders.value = new Headers({ "x-forwarded-for": "203.0.113.7" });
    const seen = capture();

    await apiRequest({
      operation: "probe",
      path: "/probe",
      schema: companySchema,
    });

    expect(seen.headers?.has("x-kybr-client-ip")).toBe(false);
  });

  it("forwards the client IP from the trusted header when forwardClientIp is true", async () => {
    requestHeaders.value = new Headers({ "x-forwarded-for": "203.0.113.7" });
    const seen = capture();

    await apiRequest({
      operation: "probe",
      path: "/probe",
      schema: companySchema,
      forwardClientIp: true,
    });

    expect(seen.headers?.get("x-kybr-client-ip")).toBe("203.0.113.7");
  });

  it("omits the client IP when the trusted header is missing", async () => {
    const seen = capture();

    await apiRequest({
      operation: "probe",
      path: "/probe",
      schema: companySchema,
      forwardClientIp: true,
    });

    expect(seen.headers?.has("x-kybr-client-ip")).toBe(false);
  });

  it("sends a JSON body and extra headers", async () => {
    const seen = capture();

    await apiRequest({
      operation: "probe",
      path: "/probe",
      method: "POST",
      body: { cnpj: "11222333000181" },
      headers: { "Idempotency-Key": "8f2c3a4e-0000-4000-8000-000000000000" },
      schema: companySchema,
    });

    expect(seen.headers?.get("content-type")).toBe("application/json");
    expect(seen.headers?.get("idempotency-key")).toBe(
      "8f2c3a4e-0000-4000-8000-000000000000",
    );
    expect(seen.body).toBe('{"cnpj":"11222333000181"}');
  });

  it("parses an empty 204 body as undefined", async () => {
    server.use(
      http.put(`${API}/probe`, () => new HttpResponse(null, { status: 204 })),
    );

    const result = await apiRequest({
      operation: "probe",
      path: "/probe",
      method: "PUT",
      schema: z.undefined(),
    });

    expect(result).toMatchObject({ ok: true, status: 204, data: undefined });
  });

  it("passes the cache mode and Next cache options through to fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    capture();

    await apiRequest({
      operation: "probe",
      path: "/probe",
      schema: companySchema,
      next: { revalidate: 60, tags: ["public-link:loja-exemplo"] },
    });
    await apiRequest({
      operation: "probe",
      path: "/probe",
      schema: companySchema,
      cache: "no-store",
    });

    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: 60, tags: ["public-link:loja-exemplo"] },
    });
    expect(fetchSpy.mock.calls[1]?.[1]).toMatchObject({ cache: "no-store" });
  });

  describe("failures", () => {
    it("turns a non-2xx response into an AppError with code, status, request id and Retry-After", async () => {
      respond(
        429,
        { code: "LIMITE_CNPJ", message: SENTINEL },
        { "X-Request-Id": "req-9", "Retry-After": "540" },
      );

      const error = await failure();

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        code: "LIMITE_CNPJ",
        status: 429,
        requestId: "req-9",
        retryAfterSeconds: 540,
      });
    });

    it("never exposes the backend message", async () => {
      respond(404, { code: "LINK_NAO_ENCONTRADO", message: SENTINEL });

      const error = await failure();

      expect(error.message).not.toContain(SENTINEL);
      expect(JSON.stringify(error)).not.toContain(SENTINEL);
      expect(error).not.toHaveProperty("backendMessage");
    });

    it("keeps the field a validation error points at", async () => {
      respond(422, { code: "CNPJ_INVALIDO", message: SENTINEL, field: "cnpj" });

      expect(await failure()).toMatchObject({
        code: "CNPJ_INVALIDO",
        field: "cnpj",
      });
    });

    it.each([
      [500, "UNAVAILABLE", { code: "ERRO_INTERNO", message: SENTINEL }],
      [503, "UNAVAILABLE", "<html>bad gateway</html>"],
      [418, "UNKNOWN", { code: "CODIGO_NOVO", message: SENTINEL }],
    ])(
      "maps status %i with an unknown or missing code to %s",
      async (status, code, body) => {
        respond(status, body);

        expect(await failure()).toMatchObject({ code, status });
      },
    );

    it("maps a network failure to NETWORK", async () => {
      server.use(http.get(`${API}/probe`, () => HttpResponse.error()));

      expect(await failure()).toMatchObject({ code: "NETWORK" });
    });

    it("maps a timeout to TIMEOUT", async () => {
      server.use(
        http.get(`${API}/probe`, async () => {
          await delay("infinite");
          return HttpResponse.json({});
        }),
      );

      const result = await apiRequest({
        operation: "probe",
        path: "/probe",
        schema: companySchema,
        timeoutMs: 50,
      });

      expect(result).toMatchObject({ ok: false, error: { code: "TIMEOUT" } });
    });

    it("maps a schema mismatch to INVALID_RESPONSE and logs it once, shape only", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      respond(
        200,
        { razao_social: 42, responsavel: "Maria Exemplo Silva" },
        { "X-Request-Id": "req-3" },
      );

      const error = await failure();

      expect(error).toMatchObject({
        code: "INVALID_RESPONSE",
        status: 200,
        requestId: "req-3",
      });
      expect(log).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(log.mock.calls[0]);
      expect(logged).toContain("probe");
      expect(logged).toContain("req-3");
      expect(logged).toContain("razao_social");
      expect(logged).not.toContain("Maria");
      expect(logged).not.toContain("42");
    });
  });
});

describe("parseClientIp", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    ["2001:db8::1", "2001:db8::1"],
    // A list: the right-most entry is the one the trusted proxy appended.
    ["198.51.100.1, 203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7 ", "203.0.113.7"],
  ])("reads %j as %j", (value, ip) => {
    expect(parseClientIp(value)).toBe(ip);
  });

  it.each([null, "", "unknown", "203.0.113.7, not-an-ip", "<script>"])(
    "ignores %j",
    (value) => {
      expect(parseClientIp(value)).toBeUndefined();
    },
  );
});
