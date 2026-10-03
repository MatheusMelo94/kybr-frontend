// @vitest-environment node
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/api/errors";
import {
  createVerification,
  getPublicLink,
  lookupCompany,
} from "@/lib/api/public-link";
import {
  SLUGS,
  cnpjFor,
  MEI_CNPJS,
} from "@/tests/fixtures/factories/seller-link";
import { server } from "@/tests/fixtures/msw/server";

const API = "http://api.kybr.test"; // API_BASE_URL in vitest.config.mts
const KEY = "0f9a3e0c-4b2d-4c1e-9f7a-2d3b4c5e6f70";

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

describe("getPublicLink (D1)", () => {
  it("S1: returns the name and an e-mail contact", async () => {
    expect(await getPublicLink(SLUGS.ok)).toEqual({
      ok: true,
      link: {
        nome: "Loja Exemplo",
        contato_vendedor: {
          tipo: "email",
          valor: "vendedores@loja-exemplo.test",
        },
      },
    });
  });

  it("returns a URL contact as a checked https: URL", async () => {
    expect(await getPublicLink(SLUGS.other)).toMatchObject({
      ok: true,
      link: {
        contato_vendedor: {
          tipo: "url",
          valor: "https://outra-loja.test/ajuda",
        },
      },
    });
  });

  it("caches for 60 s per slug and sends no client IP", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const seen = captureRequests();

    await getPublicLink(SLUGS.ok);

    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: 60, tags: ["public-link:loja-exemplo"] },
    });
    expect(seen[0]?.headers.has("x-kybr-client-ip")).toBe(false);
    expect(seen[0]?.headers.has("x-kybr-bff-key")).toBe(true);
  });

  it("S2: returns not-found on 404", async () => {
    expect(await getPublicLink(SLUGS.unknown)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it.each(["../admin", "Loja", "a?b", ""])(
    "returns not-found for the malformed slug %j without calling the API",
    async (slug) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      expect(await getPublicLink(slug)).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it("S3: throws an AppError for the error boundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getPublicLink(SLUGS.unstable)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it.each([
    [
      "an e-mail with a query",
      { tipo: "email", valor: "vendas@loja.test?subject=oi" },
    ],
    ["an e-mail with &", { tipo: "email", valor: "a&b@loja.test" }],
    ["an e-mail with #", { tipo: "email", valor: "vendas@loja.test#x" }],
    ["an e-mail with a space", { tipo: "email", valor: "vendas @loja.test" }],
    [
      "an e-mail with a control character",
      { tipo: "email", valor: "vendas@loja.test\n" },
    ],
    ["an http: URL", { tipo: "url", valor: "http://loja.test" }],
    ["a javascript: URL", { tipo: "url", valor: "javascript:alert(1)" }],
  ])(
    "refuses a contact that is %s (it could become a mailto: or href)",
    async (_case, contato) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      server.use(
        http.get(`${API}/public/v/loja-exemplo`, () =>
          HttpResponse.json({
            nome: "Loja Exemplo",
            contato_vendedor: contato,
          }),
        ),
      );

      await expect(getPublicLink(SLUGS.ok)).rejects.toMatchObject({
        code: "INVALID_RESPONSE",
      });
    },
  );
});

describe("lookupCompany (D2)", () => {
  it("S4: returns the business name, activity, city and state, and no street address", async () => {
    server.use(
      http.get(`${API}/public/v/loja-exemplo/lookup`, () =>
        HttpResponse.json({
          razao_social: "AUTO PECAS EXEMPLO LTDA",
          municipio: "Campinas",
          uf: "SP",
          cnae: { descricao: "Comércio a varejo de peças" },
          endereco: "Rua Exemplo, 1",
        }),
      ),
    );

    expect(await lookupCompany(SLUGS.ok, cnpjFor("aprovado"))).toEqual({
      ok: true,
      company: {
        razao_social: "AUTO PECAS EXEMPLO LTDA",
        municipio: "Campinas",
        uf: "SP",
        cnae: { descricao: "Comércio a varejo de peças" },
      },
    });
  });

  it("S16: sends ?cnpj= as 14 uppercase alphanumerics, with the client IP and no caching", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const seen = captureRequests();

    const result = await lookupCompany(SLUGS.ok, "12ABC34501DE35");

    expect(result.ok).toBe(true);
    expect(new URL(seen[0]?.url ?? "").search).toBe("?cnpj=12ABC34501DE35");
    expect(seen[0]?.headers.get("x-kybr-client-ip")).toBe("203.0.113.7");
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });

  it("S18: keeps the backend's CPF mask", async () => {
    expect(await lookupCompany(SLUGS.ok, MEI_CNPJS.masked)).toMatchObject({
      ok: true,
      company: { razao_social: "JOAO CARLOS SILVA ***.***.***-**" },
    });
  });

  it("S18: masks a CPF the backend left unmasked (frontend backstop)", async () => {
    expect(await lookupCompany(SLUGS.ok, MEI_CNPJS.unmasked)).toMatchObject({
      ok: true,
      company: { razao_social: "JOAO CARLOS SILVA ***.***.***-**" },
    });
  });

  it("S7: not found", async () => {
    expect(await lookupCompany(SLUGS.ok, cnpjFor("sem-dados"))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("S8: rate-limited, with Retry-After", async () => {
    expect(await lookupCompany(SLUGS.ok, cnpjFor("limite-consulta"))).toEqual({
      ok: false,
      reason: "rate_limited",
      retryAfterSeconds: 60,
    });
  });

  it("S19: the autofill kill switch is a plain failure", async () => {
    expect(await lookupCompany(SLUGS.noAutofill, cnpjFor("aprovado"))).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("a network failure is a plain failure, never a throw", async () => {
    server.use(
      http.get(`${API}/public/v/loja-exemplo/lookup`, () =>
        HttpResponse.error(),
      ),
    );

    expect(await lookupCompany(SLUGS.ok, cnpjFor("aprovado"))).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it.each(["12abc34501de35", "12.ABC.345/01DE-35", "12ABC34501DE36"])(
    "refuses the non-canonical or invalid CNPJ %j without calling the API",
    async (cnpj) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      expect(await lookupCompany(SLUGS.ok, cnpj)).toEqual({
        ok: false,
        reason: "failed",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );
});

describe("createVerification (D3)", () => {
  const input = {
    cnpj: "12ABC34501DE35",
    responsavel: "Maria Exemplo",
    ref: "onboarding",
  };

  it("S16: returns an X3 token and sends the canonical CNPJ, the idempotency key and the client IP", async () => {
    const seen = captureRequests();

    const result = await createVerification(SLUGS.ok, input, KEY);

    expect(result).toEqual({
      ok: true,
      token: expect.stringMatching(/^[A-Za-z0-9_-]{22,64}$/),
    });
    expect(await seen[0]?.json()).toEqual(input);
    expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
    expect(seen[0]?.headers.get("x-kybr-client-ip")).toBe("203.0.113.7");
  });

  it.each([
    ["limite-cnpj", "limit_cnpj"],
    ["limite-geral", "limit_generic"],
  ] as const)("S9: %s → %s with Retry-After", async (scenario, reason) => {
    expect(
      await createVerification(
        SLUGS.ok,
        { ...input, cnpj: cnpjFor(scenario) },
        KEY,
      ),
    ).toEqual({ ok: false, reason, retryAfterSeconds: 540 });
  });

  it("returns the field the API rejected", async () => {
    expect(
      await createVerification(
        SLUGS.ok,
        { ...input, responsavel: "Maria" },
        KEY,
      ),
    ).toEqual({ ok: false, reason: "invalid_field", field: "responsavel" });
  });

  it("S2: a link disabled at submit time is link_not_found", async () => {
    expect(await createVerification(SLUGS.unknown, input, KEY)).toEqual({
      ok: false,
      reason: "link_not_found",
    });
  });

  it("refuses a token that isn't X3, so router.push can't be steered", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.post(`${API}/public/v/loja-exemplo/verify`, () =>
        HttpResponse.json({ token: "../../evil" }, { status: 201 }),
      ),
    );

    expect(await createVerification(SLUGS.ok, input, KEY)).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("maps 5xx and network failures to failed", async () => {
    server.use(
      http.post(`${API}/public/v/loja-exemplo/verify`, () =>
        HttpResponse.error(),
      ),
    );

    expect(await createVerification(SLUGS.ok, input, KEY)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});
