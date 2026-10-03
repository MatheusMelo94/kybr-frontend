// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "msw";
import { revalidateTag } from "next/cache";

import {
  lookupCompanyAction,
  startVerification,
} from "@/features/seller-link/actions";
import { server } from "@/tests/fixtures/msw/server";
import {
  MEI_CNPJS,
  SLUGS,
  cnpjFor,
} from "@/tests/fixtures/factories/seller-link";

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

beforeEach(() => {
  requestHeaders.value = new Headers({ "x-forwarded-for": "203.0.113.7" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lookupCompanyAction (read-only, ADR-0004a)", () => {
  it("returns only the company block's projection", async () => {
    const result = await lookupCompanyAction(SLUGS.ok, cnpjFor("aprovado"));

    expect(result).toEqual({
      ok: true,
      company: {
        razaoSocial: expect.any(String),
        atividade: expect.any(String),
        municipio: expect.any(String),
        uf: expect.stringMatching(/^[A-Z]{2}$/),
      },
    });
  });

  it("works for an alphanumeric CNPJ (S16)", async () => {
    expect((await lookupCompanyAction(SLUGS.ok, "12ABC34501DE35")).ok).toBe(
      true,
    );
  });

  it("masks a CPF the API left unmasked (S18)", async () => {
    expect(
      await lookupCompanyAction(SLUGS.ok, MEI_CNPJS.unmasked),
    ).toMatchObject({
      ok: true,
      company: { razaoSocial: "JOAO CARLOS SILVA ***.***.***-**" },
    });
  });

  it("returns not_found for S7", async () => {
    expect(await lookupCompanyAction(SLUGS.ok, cnpjFor("sem-dados"))).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it.each([
    ["S8 rate-limited", SLUGS.ok, cnpjFor("limite-consulta")],
    ["S19 kill switch", SLUGS.noAutofill, cnpjFor("aprovado")],
  ])("returns failed for %s", async (_case, slug, cnpj) => {
    expect(await lookupCompanyAction(slug, cnpj)).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it.each([
    ["a malformed slug", "../admin", cnpjFor("aprovado")],
    ["a non-string slug", { slug: "loja-exemplo" }, cnpjFor("aprovado")],
    ["a lowercase CNPJ", SLUGS.ok, "12abc34501de35"],
    ["a masked CNPJ", SLUGS.ok, "12.ABC.345/01DE-35"],
    ["an invalid CNPJ", SLUGS.ok, "12ABC34501DE36"],
    ["a non-string CNPJ", SLUGS.ok, 12345678000195],
  ])("refuses %s without calling the API", async (_case, slug, cnpj) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await lookupCompanyAction(slug, cnpj)).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("startVerification (D3 write)", () => {
  const KEY = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
  const input = {
    slug: SLUGS.ok,
    idempotencyKey: KEY,
    cnpj: "12.abc.345/01de-35",
    responsavel: "  Maria   Exemplo ",
    ref: "onboarding",
    ext_id: "SELLER-42",
  };

  function captureVerify(): Promise<Request> {
    return new Promise((resolve) => {
      server.events.on("request:start", ({ request }) => {
        if (request.url.endsWith("/verify")) resolve(request.clone());
      });
    });
  }

  afterEach(() => {
    server.events.removeAllListeners();
  });

  it("AC 12 / AC 5: sends the canonical CNPJ, the tidy name and the passthrough, and returns the token", async () => {
    const sent = captureVerify();

    const result = await startVerification(input);

    expect(result).toEqual({
      ok: true,
      token: expect.stringMatching(/^[A-Za-z0-9_-]{22,64}$/),
    });
    const request = await sent;
    expect(await request.json()).toEqual({
      cnpj: "12ABC34501DE35",
      responsavel: "Maria Exemplo",
      ref: "onboarding",
      ext_id: "SELLER-42",
    });
    expect(request.headers.get("idempotency-key")).toBe(KEY);
  });

  it("re-validates the fields and returns their issues, without calling the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(
      await startVerification({
        ...input,
        cnpj: "12.ABC.345/01DE-3A",
        responsavel: "Maria",
      }),
    ).toEqual({
      ok: false,
      reason: "invalid",
      fields: { cnpj: "check_letters", responsavel: "single" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["not a UUID", "abc"],
    ["missing", undefined],
    ["a UUID with junk", `${KEY}\r\nX-Evil: 1`],
  ])(
    "F17: refuses an idempotency key that is %s, before forwarding",
    async (_case, idempotencyKey) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      expect(await startVerification({ ...input, idempotencyKey })).toEqual({
        ok: false,
        reason: "failed",
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([null, "x", 42, []])(
    "refuses a non-object input (%j)",
    async (value) => {
      expect(await startVerification(value)).toEqual({
        ok: false,
        reason: "failed",
      });
    },
  );

  it("drops a ref that isn't printable ASCII instead of sending it (F07)", async () => {
    const sent = captureVerify();

    await startVerification({ ...input, ref: "a\u0000b" });

    expect(await (await sent).json()).not.toHaveProperty("ref");
  });

  it.each([
    ["limite-cnpj", "limit_cnpj"],
    ["limite-geral", "limit_generic"],
  ] as const)("AC 14: %s is %s, with Retry-After", async (scenario, reason) => {
    expect(
      await startVerification({ ...input, cnpj: cnpjFor(scenario) }),
    ).toEqual({
      ok: false,
      reason,
      retryAfterSeconds: 540,
    });
  });

  it("AC 14: a link disabled at submit time is link_not_found, and its cached info is invalidated", async () => {
    expect(await startVerification({ ...input, slug: SLUGS.unknown })).toEqual({
      ok: false,
      reason: "link_not_found",
    });
    expect(revalidateTag).toHaveBeenCalledWith(`public-link:${SLUGS.unknown}`);
  });

  it("a malformed slug is link_not_found with no API call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await startVerification({ ...input, slug: "../x" })).toEqual({
      ok: false,
      reason: "link_not_found",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps an API field rejection to that field's invalid issue", async () => {
    server.use(
      http.post("http://api.kybr.test/public/v/loja-exemplo/verify", () =>
        HttpResponse.json(
          { code: "RESPONSAVEL_INVALIDO", message: "x", field: "responsavel" },
          { status: 422 },
        ),
      ),
    );

    expect(await startVerification(input)).toEqual({
      ok: false,
      reason: "invalid",
      fields: { responsavel: "invalid" },
    });
  });

  it("maps a network failure or 5xx to failed", async () => {
    server.use(
      http.post("http://api.kybr.test/public/v/loja-exemplo/verify", () =>
        HttpResponse.error(),
      ),
    );

    expect(await startVerification(input)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});
