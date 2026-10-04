// @vitest-environment node
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveCaseContact } from "@/lib/api/public-link";
import { CASE_TOKENS, SLUGS } from "@/tests/fixtures/factories/seller-link";
import { server } from "@/tests/fixtures/msw/server";

const API = "http://api.kybr.test"; // API_BASE_URL in vitest.config.mts
const CONTACT_PATH = `${API}/public/v/:slug/cases/:token/contact`;
const EMAIL = "maria@empresa-exemplo.test";

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));

function captureRequests(): Request[] {
  const seen: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    seen.push(request.clone());
  });
  return seen;
}

beforeEach(() => {
  requestHeaders.value = new Headers({ "x-forwarded-for": "203.0.113.7" });
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

describe("saveCaseContact (D5)", () => {
  it("PUTs the address with the client IP and returns ok on 204", async () => {
    const seen = captureRequests();

    const result = await saveCaseContact(SLUGS.ok, CASE_TOKENS.pendente, EMAIL);

    expect(result).toEqual({ ok: true });
    const [request] = seen;
    expect(request?.method).toBe("PUT");
    expect(new URL(request?.url ?? "").pathname).toBe(
      `/public/v/${SLUGS.ok}/cases/${CASE_TOKENS.pendente}/contact`,
    );
    expect(request?.headers.get("x-kybr-client-ip")).toBe("203.0.113.7");
    expect(await request?.json()).toEqual({ email: EMAIL });
  });

  it("maps 422 EMAIL_INVALIDO to invalid_email", async () => {
    server.use(
      http.put(CONTACT_PATH, () =>
        HttpResponse.json(
          { code: "EMAIL_INVALIDO", message: "x", field: "email" },
          { status: 422 },
        ),
      ),
    );

    expect(
      await saveCaseContact(SLUGS.ok, CASE_TOKENS.pendente, EMAIL),
    ).toEqual({ ok: false, reason: "invalid_email" });
  });

  it("F06a: maps 409 CASO_DECIDIDO (the case was decided) to decided", async () => {
    expect(
      await saveCaseContact(SLUGS.ok, CASE_TOKENS.aprovado, EMAIL),
    ).toEqual({ ok: false, reason: "decided" });
  });

  it("maps an unknown token to not_found", async () => {
    expect(await saveCaseContact(SLUGS.ok, CASE_TOKENS.unknown, EMAIL)).toEqual(
      { ok: false, reason: "not_found" },
    );
  });

  it("maps a 5xx to failed and logs its shape, never the address", async () => {
    server.use(
      http.put(CONTACT_PATH, () =>
        HttpResponse.json(
          { code: "ERRO_INTERNO", message: "x" },
          { status: 500, headers: { "X-Request-Id": "req-5xx" } },
        ),
      ),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(
      await saveCaseContact(SLUGS.ok, CASE_TOKENS.pendente, EMAIL),
    ).toEqual({ ok: false, reason: "failed" });
    const calls = JSON.stringify(log.mock.calls);
    expect(calls).toContain("req-5xx");
    expect(calls).not.toContain(EMAIL);
    expect(calls).not.toContain(CASE_TOKENS.pendente);
  });

  it("refuses a malformed slug or token with no API call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await saveCaseContact("../x", CASE_TOKENS.pendente, EMAIL)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await saveCaseContact(SLUGS.ok, "short", EMAIL)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
