// @vitest-environment node
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/api/errors";
import { getPublicCase } from "@/lib/api/public-link";
import { publicCaseSchema } from "@/lib/api/schemas/public-link";
import { CASE_TOKENS, SLUGS } from "@/tests/fixtures/factories/seller-link";
import { server } from "@/tests/fixtures/msw/server";

const API = "http://api.kybr.test"; // API_BASE_URL in vitest.config.mts
const CASE_PATH = `${API}/public/v/:slug/cases/:token`;

const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.value }));

function captureRequests(): Request[] {
  const seen: Request[] = [];
  server.events.on("request:start", ({ request }) => {
    seen.push(request.clone());
  });
  return seen;
}

/** Serves one D4 body for every case read. */
function serveCase(body: unknown): void {
  server.use(http.get(CASE_PATH, () => HttpResponse.json(body as never)));
}

const CREATED = "2026-10-01T12:00:00.000Z";

const company = {
  razao_social: "Comercial Exemplo Ltda.",
  responsavel: "Maria Exemplo Silva",
  consultado_em: CREATED,
};

/** The console.error calls, as one string, to prove no value was logged. */
function logged(spy: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(spy.mock.calls);
}

beforeEach(() => {
  requestHeaders.value = new Headers({ "x-forwarded-for": "203.0.113.7" });
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

describe("getPublicCase (D4)", () => {
  it("S4: returns the case, uncached, with the client IP", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const seen = captureRequests();

    const result = await getPublicCase(SLUGS.ok, CASE_TOKENS.aprovado);

    expect(result).toMatchObject({
      ok: true,
      publicCase: {
        estado: "approved",
        criado_em: CREATED,
        resultado: {
          razao_social: expect.any(String),
          consultado_em: CREATED,
          confirmacoes: [
            { codigo: "SITUACAO_ATIVA" },
            { codigo: "IE_ATIVA", uf: "SP" },
            { codigo: "RESPONSAVEL_CONFERE" },
          ],
        },
      },
    });
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(seen[0]?.headers.get("x-kybr-client-ip")).toBe("203.0.113.7");
    expect(seen[0]?.headers.has("x-kybr-bff-key")).toBe(true);
  });

  it.each([
    ["an unknown token (S11)", SLUGS.ok, CASE_TOKENS.unknown],
    ["a token from another slug (S11)", SLUGS.other, CASE_TOKENS.aprovado],
    ["an unknown slug", SLUGS.unknown, CASE_TOKENS.aprovado],
  ])("%s is not-found", async (_name, slug, token) => {
    expect(await getPublicCase(slug, token)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it.each([
    ["a malformed token", SLUGS.ok, "tok/../../00000000000000"],
    ["a short token", SLUGS.ok, "short"],
    ["a malformed slug", "Loja_Invalida", CASE_TOKENS.aprovado],
  ])("%s is not-found with no API call", async (_name, slug, token) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(await getPublicCase(slug, token)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("S12: a 5xx throws an AppError for the error boundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      getPublicCase(SLUGS.ok, CASE_TOKENS.unstable),
    ).rejects.toMatchObject({ name: "AppError", code: "UNAVAILABLE" });
  });

  it("a response that breaks the shape throws INVALID_RESPONSE", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    serveCase({ estado: "approved", criado_em: CREATED });

    const error = await getPublicCase(SLUGS.ok, CASE_TOKENS.aprovado).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("S7: processing with the no-data variant, without razao_social or consultado_em", async () => {
    const result = await getPublicCase(SLUGS.ok, CASE_TOKENS.semDados);

    expect(result).toMatchObject({
      ok: true,
      publicCase: {
        estado: "processing",
        resultado: { variante: "DADOS_NAO_ENCONTRADOS" },
      },
    });
  });

  it("S7: a document requested by Renata, without company data", async () => {
    const result = await getPublicCase(SLUGS.ok, CASE_TOKENS.semDadosDocumento);

    expect(result).toMatchObject({
      ok: true,
      publicCase: {
        estado: "pending",
        resultado: {
          variante: "DADOS_NAO_ENCONTRADOS",
          itens: [
            {
              codigo: "DOCUMENTO_SOLICITADO",
              documento_tipo: "CONTRATO_SOCIAL_OU_CCMEI",
              documentos_enviados: 0,
            },
          ],
        },
      },
    });
  });

  it("S7: approved without razao_social or consultado_em", async () => {
    const result = await getPublicCase(SLUGS.ok, CASE_TOKENS.semDadosAprovado);

    expect(result).toMatchObject({
      ok: true,
      publicCase: {
        estado: "approved",
        resultado: { variante: "DADOS_NAO_ENCONTRADOS" },
      },
    });
  });
});

describe("publicCaseSchema", () => {
  it("parses a processing case with no resultado", () => {
    expect(
      publicCaseSchema.parse({ estado: "processing", criado_em: CREATED }),
    ).toEqual({ estado: "processing", criado_em: CREATED });
  });

  it.each(["pending", "approved", "blocked"])(
    "requires resultado on %s",
    (estado) => {
      expect(
        publicCaseSchema.safeParse({ estado, criado_em: CREATED }).success,
      ).toBe(false);
    },
  );

  it("requires criado_em as an ISO date-time", () => {
    expect(publicCaseSchema.safeParse({ estado: "processing" }).success).toBe(
      false,
    );
    expect(
      publicCaseSchema.safeParse({
        estado: "processing",
        criado_em: "ontem",
      }).success,
    ).toBe(false);
  });

  describe("razao_social and consultado_em (spec v3)", () => {
    it.each(["razao_social", "consultado_em"])(
      "requires %s without the no-data variant",
      (key) => {
        const resultado: Record<string, unknown> = {
          ...company,
          confirmacoes: [],
        };
        delete resultado[key];

        expect(
          publicCaseSchema.safeParse({
            estado: "approved",
            criado_em: CREATED,
            resultado,
          }).success,
        ).toBe(false);
      },
    );

    it("makes both optional with DADOS_NAO_ENCONTRADOS", () => {
      expect(
        publicCaseSchema.parse({
          estado: "approved",
          criado_em: CREATED,
          resultado: {
            responsavel: "Maria Exemplo Silva",
            variante: "DADOS_NAO_ENCONTRADOS",
          },
        }).resultado,
      ).toEqual({
        responsavel: "Maria Exemplo Silva",
        variante: "DADOS_NAO_ENCONTRADOS",
      });
    });

    it("masks a CPF left in razao_social, as T12 does", () => {
      const parsed = publicCaseSchema.parse({
        estado: "approved",
        criado_em: CREATED,
        resultado: {
          ...company,
          razao_social: "JOAO CARLOS SILVA 123.456.789-09",
        },
      });

      expect(parsed.resultado?.razao_social).toBe(
        "JOAO CARLOS SILVA ***.***.***-**",
      );
    });
  });

  describe("pending items", () => {
    function parseItems(itens: unknown[]): unknown {
      return publicCaseSchema.parse({
        estado: "pending",
        criado_em: CREATED,
        resultado: { ...company, prazo_revisao: CREATED, itens },
      }).resultado?.itens;
    }

    it("keeps every known item with the fields its copy needs", () => {
      expect(
        parseItems([
          {
            codigo: "DOCUMENTO_RESPONSAVEL",
            documento_tipo: "RESPONSAVEL",
            documentos_enviados: 1,
          },
          {
            codigo: "DOCUMENTO_SOLICITADO",
            documento_tipo: "CARTAO_CNPJ",
            documentos_enviados: 0,
          },
          { codigo: "IE_NAO_ENCONTRADA" },
          { codigo: "IE_SUSPENSA" },
          { codigo: "SITUACAO_IRREGULAR", situacao: "baixada" },
          { codigo: "ATIVIDADE_FORA_DA_CATEGORIA" },
          { codigo: "EMPRESA_RECENTE", dias: 1 },
          { codigo: "MEI" },
        ]),
      ).toEqual([
        {
          codigo: "DOCUMENTO_RESPONSAVEL",
          documento_tipo: "RESPONSAVEL",
          documentos_enviados: 1,
        },
        {
          codigo: "DOCUMENTO_SOLICITADO",
          documento_tipo: "CARTAO_CNPJ",
          documentos_enviados: 0,
        },
        { codigo: "IE_NAO_ENCONTRADA" },
        { codigo: "IE_SUSPENSA" },
        { codigo: "SITUACAO_IRREGULAR", situacao: "baixada" },
        { codigo: "ATIVIDADE_FORA_DA_CATEGORIA" },
        { codigo: "EMPRESA_RECENTE", dias: 1 },
        { codigo: "MEI" },
      ]);
    });

    it("drops an unknown item code and logs it by shape only", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(
        parseItems([
          { codigo: "QSA_DIVERGENTE", detalhe: "Fulano de Tal" },
          { codigo: "MEI" },
        ]),
      ).toEqual([{ codigo: "MEI" }]);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(logged(spy)).not.toContain("QSA_DIVERGENTE");
      expect(logged(spy)).not.toContain("Fulano");
    });

    it("drops a document item without documento_tipo", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(
        parseItems([
          { codigo: "DOCUMENTO_SOLICITADO", documentos_enviados: 0 },
          { codigo: "DOCUMENTO_RESPONSAVEL", documento_tipo: "OUTRO" },
        ]),
      ).toEqual([]);
    });

    it("drops an item whose copy would be left with an empty placeholder", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(
        parseItems([
          { codigo: "SITUACAO_IRREGULAR" },
          { codigo: "SITUACAO_IRREGULAR", situacao: "cancelada" },
          { codigo: "EMPRESA_RECENTE" },
        ]),
      ).toEqual([]);
    });

    it("counts a document item with no documentos_enviados as zero received", () => {
      expect(
        parseItems([
          { codigo: "DOCUMENTO_SOLICITADO", documento_tipo: "PROCURACAO" },
        ]),
      ).toEqual([
        {
          codigo: "DOCUMENTO_SOLICITADO",
          documento_tipo: "PROCURACAO",
          documentos_enviados: 0,
        },
      ]);
    });

    it("drops unknown confirmation codes", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(
        publicCaseSchema.parse({
          estado: "approved",
          criado_em: CREATED,
          resultado: {
            ...company,
            confirmacoes: [
              { codigo: "SITUACAO_ATIVA" },
              { codigo: "POLITICA_OK" },
              { codigo: "IE_ATIVA" },
            ],
          },
        }).resultado?.confirmacoes,
      ).toEqual([{ codigo: "SITUACAO_ATIVA" }]);
    });
  });

  describe("motivo", () => {
    function parseMotivo(motivo: unknown): unknown {
      return publicCaseSchema.parse({
        estado: "blocked",
        criado_em: CREATED,
        resultado: { ...company, motivo },
      }).resultado?.motivo;
    }

    it("keeps a known reason", () => {
      expect(
        parseMotivo({ codigo: "SITUACAO_IRREGULAR", situacao: "inapta" }),
      ).toEqual({ codigo: "SITUACAO_IRREGULAR", situacao: "inapta" });
      expect(parseMotivo({ codigo: "MEI" })).toEqual({ codigo: "MEI" });
    });

    it("without company data, coerces any reason but GENERICO to GENERICO and logs it (spec v3)", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const parsed = publicCaseSchema.parse({
        estado: "blocked",
        criado_em: CREATED,
        resultado: {
          responsavel: "Maria Exemplo Silva",
          variante: "DADOS_NAO_ENCONTRADOS",
          motivo: { codigo: "MEI" },
        },
      });

      expect(parsed.resultado?.motivo).toEqual({ codigo: "GENERICO" });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(logged(spy)).not.toContain("Maria");
    });

    it.each([
      { codigo: "VEREDITO_NEGATIVO" },
      { codigo: "SITUACAO_IRREGULAR" },
      "MEI",
    ])("turns the unknown or incomplete reason %j into GENERICO", (motivo) => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(parseMotivo(motivo)).toEqual({ codigo: "GENERICO" });
    });
  });

  describe("url_regularizacao (F14)", () => {
    function parseUrl(url: string): unknown {
      const parsed = publicCaseSchema.parse({
        estado: "pending",
        criado_em: CREATED,
        resultado: {
          ...company,
          prazo_revisao: CREATED,
          itens: [{ codigo: "IE_SUSPENSA", url_regularizacao: url }],
        },
      });
      const [item] = parsed.resultado?.itens ?? [];
      return item !== undefined && "url_regularizacao" in item
        ? item.url_regularizacao
        : undefined;
    }

    it.each([
      "https://gov.br/regularizar",
      "https://www.gov.br/receitafederal/exemplo",
      "https://portal.fazenda.sp.gov.br/exemplo",
    ])("keeps %s", (url) => {
      expect(parseUrl(url)).toBe(url);
    });

    it.each([
      "http://www.gov.br/receitafederal/exemplo",
      "https://evilgov.br/exemplo",
      "https://gov.br.evil.test/exemplo",
      "https://receita.test/regularizar",
      "https://user:pass@www.gov.br/exemplo",
      "javascript:alert(1)",
      "/relative/gov.br",
    ])("drops %s", (url) => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(parseUrl(url)).toBeUndefined();
    });

    it("applies to the blocked reason too", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const parsed = publicCaseSchema.parse({
        estado: "blocked",
        criado_em: CREATED,
        resultado: {
          ...company,
          motivo: {
            codigo: "IE_NAO_ENCONTRADA",
            url_regularizacao: "https://sefaz.example.test/ie",
          },
        },
      });

      expect(parsed.resultado?.motivo).toEqual({
        codigo: "IE_NAO_ENCONTRADA",
      });
    });
  });
});
