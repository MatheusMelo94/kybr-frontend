// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { http, HttpResponse } from "msw";
import { revalidateTag } from "next/cache";

import {
  lookupCompanyAction,
  pollCaseViewAction,
  startVerification,
} from "@/features/seller-link/actions";
import { disableLink } from "@/tests/fixtures/msw/handlers/seller-link";
import { server } from "@/tests/fixtures/msw/server";
import {
  CASE_TOKENS,
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

  it("AC 14: a link disabled after its info was cached as live is link_not_found, and that cached info is purged", async () => {
    vi.mocked(revalidateTag).mockClear();
    // D1 still says live (as the 60 s cache would); D3 says the link is gone.
    server.use(
      http.post("http://api.kybr.test/public/v/:slug/verify", () =>
        HttpResponse.json(
          { code: "LINK_NAO_ENCONTRADO", message: "x" },
          { status: 404 },
        ),
      ),
    );

    expect(await startVerification(input)).toEqual({
      ok: false,
      reason: "link_not_found",
    });
    expect(revalidateTag).toHaveBeenCalledWith(`public-link:${SLUGS.ok}`);
  });

  it("M2-07: an unknown slug is link_not_found with no purge (nothing cached as live)", async () => {
    vi.mocked(revalidateTag).mockClear();

    expect(await startVerification({ ...input, slug: SLUGS.unknown })).toEqual({
      ok: false,
      reason: "link_not_found",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("M2-07: no purge when the link info can't be read either", async () => {
    vi.mocked(revalidateTag).mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.post("http://api.kybr.test/public/v/:slug/verify", () =>
        HttpResponse.json(
          { code: "LINK_NAO_ENCONTRADO", message: "x" },
          { status: 404 },
        ),
      ),
      http.get("http://api.kybr.test/public/v/:slug", () =>
        HttpResponse.json(
          { code: "ERRO_INTERNO", message: "x" },
          { status: 500 },
        ),
      ),
    );

    expect(await startVerification(input)).toEqual({
      ok: false,
      reason: "link_not_found",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
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

describe("pollCaseViewAction (read-only, ADR-0004a)", () => {
  it.each([
    [CASE_TOKENS.aprovado, "approved"],
    [CASE_TOKENS.pendente, "pending"],
    [CASE_TOKENS.bloqueado, "blocked"],
    [CASE_TOKENS.processing, "analysis-timeout"],
    [CASE_TOKENS.semDados, "analysis-notfound"],
  ])("returns only the view key for %s (%s)", async (token, viewKey) => {
    expect(await pollCaseViewAction(SLUGS.ok, token)).toEqual({
      ok: true,
      viewKey,
    });
  });

  it("derives verificando with the same rules as the page, from the server clock", async () => {
    const created = await fetch(
      "http://api.kybr.test/public/v/loja-exemplo/verify",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          cnpj: cnpjFor("lento"),
          responsavel: "Maria Exemplo Silva",
        }),
      },
    );
    const { token } = (await created.json()) as { token: string };

    expect(await pollCaseViewAction(SLUGS.ok, token)).toEqual({
      ok: true,
      viewKey: "verifying",
    });
  });

  it("sends the client IP and gives up after 4 s (status checks, plan § 4)", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const seen: Request[] = [];
    server.events.on("request:start", ({ request }) => {
      seen.push(request.clone());
    });

    await pollCaseViewAction(SLUGS.ok, CASE_TOKENS.aprovado);

    expect(timeout).toHaveBeenCalledWith(4_000);
    expect(seen[0]?.headers.get("x-kybr-client-ip")).toBe("203.0.113.7");
    server.events.removeAllListeners();
  });

  it.each([
    ["an unknown token", SLUGS.ok, CASE_TOKENS.unknown],
    ["a token from another slug", SLUGS.other, CASE_TOKENS.aprovado],
  ])(
    "%s is not_found (the page then shows Case not found)",
    async (_name, slug, token) => {
      expect(await pollCaseViewAction(slug, token)).toEqual({
        ok: false,
        reason: "not_found",
      });
    },
  );

  it.each([
    ["a malformed token", SLUGS.ok, "../../x"],
    ["a non-string slug", 42, CASE_TOKENS.aprovado],
    ["a missing token", SLUGS.ok, undefined],
  ])("rejects %s before any API call", async (_name, slug, token) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await pollCaseViewAction(slug, token)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Q3 / M2-07: a link disabled while the case is open is not_found, with no cache purge (the page decides Link not found from D4)", async () => {
    vi.mocked(revalidateTag).mockClear();
    disableLink(SLUGS.ok);

    expect(await pollCaseViewAction(SLUGS.ok, CASE_TOKENS.aprovado)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("M2-07: an unknown slug never reaches revalidateTag (no purge, no re-render of the posting route)", async () => {
    vi.mocked(revalidateTag).mockClear();

    await pollCaseViewAction("loja-aleatoria-x9", CASE_TOKENS.aprovado);

    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("an unknown token leaves the link's cached info alone", async () => {
    vi.mocked(revalidateTag).mockClear();

    await pollCaseViewAction(SLUGS.ok, CASE_TOKENS.unknown);

    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("S12: a 5xx is a failed check, never a throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await pollCaseViewAction(SLUGS.ok, CASE_TOKENS.unstable)).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("a response that breaks the schema is a failed check, never a throw", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get("http://api.kybr.test/public/v/:slug/cases/:token", () =>
        HttpResponse.json({ estado: "approved" }),
      ),
    );

    expect(await pollCaseViewAction(SLUGS.ok, CASE_TOKENS.aprovado)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});
