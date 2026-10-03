// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CASE_PRESETS,
  CASE_TOKENS,
  DOCUMENT_TYPES,
  ERROR_SENTINEL,
  SLUGS,
  UPLOAD_MARKERS,
  cnpjCheckDigits,
  cnpjFor,
  isValidCnpj,
  MEI_CNPJS,
  SLOW_LINK_DELAY_MS,
  type CnpjScenario,
} from "@/tests/fixtures/factories/seller-link";
import { normalizeCnpj, validateCnpj } from "@/lib/cnpj";
import {
  disableLink,
  mockControlHandlers,
  recoverCase,
  recoverLink,
} from "@/tests/fixtures/msw/handlers/seller-link";
import { server } from "@/tests/fixtures/msw/server";

// tests/setup.ts runs the MSW server with these handlers for every test file.
const API = "http://api.kybr.test";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
const SCENARIOS: CnpjScenario[] = [
  "aprovado",
  "pendente",
  "bloqueado",
  "sem-dados",
  "limite-consulta",
  "limite-cnpj",
  "limite-geral",
  "lento",
  "aprovado-alfanumerico",
];
const CNPJ_WIRE_FORMAT = /^[0-9A-Z]{12}[0-9]{2}$/; // contract X5

type Json = Record<string, unknown>;

async function call(
  path: string,
  init?: RequestInit,
): Promise<{ response: Response; body: Json }> {
  const response = await fetch(`${API}${path}`, init);
  const text = await response.text();
  return { response, body: text ? (JSON.parse(text) as Json) : {} };
}

function verify(
  cnpj: string,
  options: { slug?: string; responsavel?: string; key?: string } = {},
): Promise<{ response: Response; body: Json }> {
  return call(`/public/v/${options.slug ?? SLUGS.ok}/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": options.key ?? crypto.randomUUID(),
    },
    body: JSON.stringify({
      cnpj,
      responsavel: options.responsavel ?? "Maria Exemplo Silva",
    }),
  });
}

async function createCase(scenario: CnpjScenario): Promise<string> {
  const { body } = await verify(cnpjFor(scenario));
  return String(body.token);
}

function readCase(
  token: string,
  slug: string = SLUGS.ok,
): Promise<{ response: Response; body: Json }> {
  return call(`/public/v/${slug}/cases/${token}`);
}

function upload(
  token: string,
  tipo: string,
  files: File[],
  origin?: string,
): Promise<{ response: Response; body: Json }> {
  const form = new FormData();
  form.set("tipo", tipo);
  for (const file of files) form.append("arquivos", file);
  return call(`/public/v/${SLUGS.ok}/cases/${token}/documents`, {
    method: "POST",
    body: form,
    ...(origin ? { headers: { origin } } : {}),
  });
}

const pdf = (name = "contrato.pdf"): File =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], name, {
    type: "application/pdf",
  });
const jpeg = (name = "pagina.jpg"): File =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])], name, {
    type: "image/jpeg",
  });

function expectErrorEnvelope(
  response: Response,
  body: Json,
  status: number,
  code: string,
): void {
  expect(response.status).toBe(status);
  expect(body.code).toBe(code);
  expect(body.message).toBe(ERROR_SENTINEL);
  expect(response.headers.get("x-request-id")).toBeTruthy();
  if (status === 429)
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("cnpjFor", () => {
  it.each(SCENARIOS)(
    "returns a wire-format CNPJ with valid check digits for %s",
    (scenario) => {
      const cnpj = cnpjFor(scenario);

      expect(cnpj).toMatch(CNPJ_WIRE_FORMAT);
      expect(cnpj.slice(12)).toBe(cnpjCheckDigits(cnpj.slice(0, 12)));
      expect(new Set(cnpj).size).toBeGreaterThan(1);
    },
  );

  it("gives every scenario its own CNPJ", () => {
    expect(new Set(SCENARIOS.map(cnpjFor)).size).toBe(SCENARIOS.length);
  });

  it("pins the spec v2 samples to S4, S5, S6 and S16", () => {
    expect(cnpjFor("aprovado")).toBe("12345678000195");
    expect(cnpjFor("pendente")).toBe("98765432000198");
    expect(cnpjFor("bloqueado")).toBe("11222333000181");
    expect(cnpjFor("aprovado-alfanumerico")).toBe("12ABC34501DE35");
  });

  it("computes check digits with the Receita ASCII−48 rule", () => {
    expect(cnpjCheckDigits("112223330001")).toBe("81");
    // Receita's illustrative alphanumeric example: 12.ABC.345/01DE-35.
    expect(cnpjCheckDigits("12ABC34501DE")).toBe("35");
  });
});

describe("fixture validator", () => {
  // The fixtures keep their own implementation (pnpm mock:api runs under plain
  // Node), so it must agree with lib/cnpj.ts on every spec case.
  it.each([
    "11.222.333/0001-81",
    "12.345.678/0001-95",
    "98.765.432/0001-98",
    "12.ABC.345/01DE-35",
    "12.ABC.345/01DE-36",
    "12.ABC.345/01DE-3A",
    "11.111.111/1111-11",
    "AA.AAA.AAA/AAAA-AA",
    "12.345.678/0001-90",
    "12.ABC.345",
  ])("agrees with lib/cnpj.ts on %s", (cnpj) => {
    const wire = normalizeCnpj(cnpj);

    expect(isValidCnpj(wire)).toBe(validateCnpj(wire) === "ok");
  });

  it("rejects lowercase or punctuated input (the wire format is strict)", () => {
    expect(isValidCnpj("12abc34501de35")).toBe(false);
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(false);
  });
});

describe("D1 link info", () => {
  it("S1: answers the link's name and seller contact", async () => {
    const { response, body } = await call(`/public/v/${SLUGS.ok}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(body).toEqual({
      nome: "Loja Exemplo",
      contato_vendedor: {
        tipo: "email",
        valor: "vendedores@loja-exemplo.test",
      },
    });
  });

  it("has a second link whose contact is an https URL", async () => {
    const { body } = await call(`/public/v/${SLUGS.other}`);

    expect(body.contato_vendedor).toEqual({
      tipo: "url",
      valor: expect.stringMatching(/^https:\/\//),
    });
  });

  it("S2: 404 LINK_NAO_ENCONTRADO for an unknown or disabled slug", async () => {
    const { response, body } = await call(`/public/v/${SLUGS.unknown}`);

    expectErrorEnvelope(response, body, 404, "LINK_NAO_ENCONTRADO");
  });

  it("S3: fails with a 500 until the test recovers it, then answers like S1", async () => {
    const failing = await call(`/public/v/${SLUGS.unstable}`);
    expectErrorEnvelope(failing.response, failing.body, 500, "ERRO_INTERNO");

    recoverLink(SLUGS.unstable);
    const recovered = await call(`/public/v/${SLUGS.unstable}`);

    expect(recovered.response.status).toBe(200);
    expect(recovered.body.nome).toEqual(expect.any(String));
  });
});

describe("D1 per-test link variants (parallel-safe E2E keys)", () => {
  it("S3: any loja-instavel-<suffix> fails on its own until that slug is recovered", async () => {
    const first = await call(`/public/v/${SLUGS.unstable}-a1`);
    expectErrorEnvelope(first.response, first.body, 500, "ERRO_INTERNO");

    recoverLink(`${SLUGS.unstable}-a1`);

    expect((await call(`/public/v/${SLUGS.unstable}-a1`)).response.status).toBe(
      200,
    );
    expect((await call(`/public/v/${SLUGS.unstable}-b2`)).response.status).toBe(
      500,
    );
  });

  it("any loja-lenta-<suffix> answers like S1, after a delay (skeleton tests)", async () => {
    const started = Date.now();
    const { response, body } = await call(`/public/v/${SLUGS.slow}-a1`);

    expect(response.status).toBe(200);
    expect(body.nome).toEqual(expect.any(String));
    expect(Date.now() - started).toBeGreaterThanOrEqual(
      SLOW_LINK_DELAY_MS - 50,
    );
  });
});

describe("per-test live links (loja-teste-<suffix>) and disabling", () => {
  it("answers like S1 until disabled, then 404s on D1, D2 and D3", async () => {
    const slug = `${SLUGS.perTest}-a1`;
    expect((await call(`/public/v/${slug}`)).response.status).toBe(200);

    disableLink(slug);

    const d1 = await call(`/public/v/${slug}`);
    expectErrorEnvelope(d1.response, d1.body, 404, "LINK_NAO_ENCONTRADO");
    const d2 = await call(
      `/public/v/${slug}/lookup?cnpj=${cnpjFor("aprovado")}`,
    );
    expectErrorEnvelope(d2.response, d2.body, 404, "LINK_NAO_ENCONTRADO");
    const d3 = await verify(cnpjFor("aprovado"), { slug });
    expectErrorEnvelope(d3.response, d3.body, 404, "LINK_NAO_ENCONTRADO");
    expect((await call(`/public/v/${SLUGS.perTest}-b2`)).response.status).toBe(
      200,
    );
  });
});

describe("D2 company lookup", () => {
  it("S4: answers the U-E projection: name, activity, city and state, no street address", async () => {
    const { response, body } = await call(
      `/public/v/${SLUGS.ok}/lookup?cnpj=${cnpjFor("aprovado")}`,
    );

    expect(response.status).toBe(200);
    expect(body).toEqual({
      razao_social: expect.any(String),
      municipio: expect.any(String),
      uf: expect.stringMatching(/^[A-Z]{2}$/),
      cnae: { descricao: expect.any(String) },
    });
  });

  it("S18: an MEI name with the CPF masked by the backend", async () => {
    const { body } = await call(
      `/public/v/${SLUGS.ok}/lookup?cnpj=${MEI_CNPJS.masked}`,
    );

    expect(body.razao_social).toBe("JOAO CARLOS SILVA ***.***.***-**");
  });

  it("S18: a contract-violating MEI name with the CPF unmasked (tests the frontend backstop)", async () => {
    const { body } = await call(
      `/public/v/${SLUGS.ok}/lookup?cnpj=${MEI_CNPJS.unmasked}`,
    );

    expect(body.razao_social).toBe("JOAO CARLOS SILVA 12345678909");
  });

  it("S19: the autofill kill switch answers 503 AUTOFILL_DESATIVADO", async () => {
    const { response, body } = await call(
      `/public/v/${SLUGS.noAutofill}/lookup?cnpj=${cnpjFor("aprovado")}`,
    );

    expectErrorEnvelope(response, body, 503, "AUTOFILL_DESATIVADO");
  });

  it("answers the same synthetic company every time", async () => {
    const first = await call(
      `/public/v/${SLUGS.ok}/lookup?cnpj=${cnpjFor("pendente")}`,
    );
    const second = await call(
      `/public/v/${SLUGS.ok}/lookup?cnpj=${cnpjFor("pendente")}`,
    );

    expect(second.body).toEqual(first.body);
  });

  it("S7: 404 EMPRESA_NAO_ENCONTRADA", async () => {
    const { response, body } = await call(
      `/public/v/${SLUGS.ok}/lookup?cnpj=${cnpjFor("sem-dados")}`,
    );

    expectErrorEnvelope(response, body, 404, "EMPRESA_NAO_ENCONTRADA");
  });

  it("S8: 429 LIMITE_CONSULTAS with Retry-After", async () => {
    const { response, body } = await call(
      `/public/v/${SLUGS.ok}/lookup?cnpj=${cnpjFor("limite-consulta")}`,
    );

    expectErrorEnvelope(response, body, 429, "LIMITE_CONSULTAS");
    expect(response.headers.get("retry-after")).toBe("60");
  });

  it("400 CNPJ_INVALIDO for wrong check digits", async () => {
    const { response, body } = await call(
      `/public/v/${SLUGS.ok}/lookup?cnpj=11222333000100`,
    );

    expectErrorEnvelope(response, body, 400, "CNPJ_INVALIDO");
  });

  it("S16: answers an alphanumeric CNPJ like a numeric one", async () => {
    const { response, body } = await call(
      `/public/v/${SLUGS.ok}/lookup?cnpj=${cnpjFor("aprovado-alfanumerico")}`,
    );

    expect(response.status).toBe(200);
    expect(body.razao_social).toEqual(expect.any(String));
  });

  it.each(["12ABC34501DE36", "12ABC34501DE3A"])(
    "S17: 400 CNPJ_INVALIDO for %s",
    async (cnpj) => {
      const { response, body } = await call(
        `/public/v/${SLUGS.ok}/lookup?cnpj=${cnpj}`,
      );

      expectErrorEnvelope(response, body, 400, "CNPJ_INVALIDO");
    },
  );
});

describe("D3 start a verification", () => {
  it("S4: 201 with an opaque token (X3)", async () => {
    const { response, body } = await verify(cnpjFor("aprovado"));

    expect(response.status).toBe(201);
    expect(String(body.token)).toMatch(TOKEN_PATTERN);
  });

  it("returns the first response again for a repeated Idempotency-Key", async () => {
    const key = crypto.randomUUID();
    const first = await verify(cnpjFor("aprovado"), { key });
    const second = await verify(cnpjFor("aprovado"), { key });

    expect(second.response.status).toBe(201);
    expect(second.body.token).toBe(first.body.token);
  });

  it.each([
    ["limite-cnpj", "LIMITE_CNPJ"],
    ["limite-geral", "LIMITE_TENTATIVAS"],
  ] as const)(
    "S9: %s → 429 %s with Retry-After 540",
    async (scenario, code) => {
      const { response, body } = await verify(cnpjFor(scenario));

      expectErrorEnvelope(response, body, 429, code);
      expect(response.headers.get("retry-after")).toBe("540");
    },
  );

  it.each(["11222333000100", "12ABC34501DE36", "12ABC34501DE3A"])(
    "422 CNPJ_INVALIDO with field for %s (S17)",
    async (cnpj) => {
      const { response, body } = await verify(cnpj);

      expectErrorEnvelope(response, body, 422, "CNPJ_INVALIDO");
      expect(body.field).toBe("cnpj");
    },
  );

  it("422 RESPONSAVEL_INVALIDO with field for a single-word name", async () => {
    const { response, body } = await verify(cnpjFor("aprovado"), {
      responsavel: "Maria",
    });

    expectErrorEnvelope(response, body, 422, "RESPONSAVEL_INVALIDO");
    expect(body.field).toBe("responsavel");
  });

  it("404 LINK_NAO_ENCONTRADO under an unknown slug", async () => {
    const { response, body } = await verify(cnpjFor("aprovado"), {
      slug: SLUGS.unknown,
    });

    expectErrorEnvelope(response, body, 404, "LINK_NAO_ENCONTRADO");
  });
});

describe("D4 case state", () => {
  it("S16: an alphanumeric CNPJ goes through processing to approved, like S4", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    const token = await createCase("aprovado-alfanumerico");

    expect((await readCase(token)).body.estado).toBe("processing");

    vi.setSystemTime(new Date("2026-10-03T12:00:03Z"));
    expect((await readCase(token)).body).toMatchObject({
      estado: "approved",
      resultado: { confirmacoes: expect.any(Array) },
    });
  });

  it("S4: processing at first (no resultado), approved with three confirmations after 3 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    const token = await createCase("aprovado");

    const early = await readCase(token);
    expect(early.body).toEqual({
      estado: "processing",
      criado_em: "2026-10-03T12:00:00.000Z",
    });

    vi.setSystemTime(new Date("2026-10-03T12:00:03Z"));
    const later = await readCase(token);
    expect(later.body).toMatchObject({
      estado: "approved",
      resultado: {
        razao_social: expect.any(String),
        responsavel: "Maria Exemplo Silva",
        consultado_em: expect.any(String),
        confirmacoes: [
          { codigo: "SITUACAO_ATIVA" },
          { codigo: "IE_ATIVA", uf: "SP" },
          { codigo: "RESPONSAVEL_CONFERE" },
        ],
      },
    });
  });

  it("S5: pending with not-a-partner, no IE, activity out of category and young company", async () => {
    const { body } = await readCase(CASE_TOKENS.pendente);

    expect(body).toMatchObject({
      estado: "pending",
      resultado: {
        prazo_revisao: expect.any(String),
        itens: [
          {
            codigo: "DOCUMENTO_RESPONSAVEL",
            documento_tipo: "RESPONSAVEL",
            documentos_enviados: 0,
          },
          {
            codigo: "IE_NAO_ENCONTRADA",
            url_regularizacao: expect.stringMatching(/^https:\/\//),
          },
          { codigo: "ATIVIDADE_FORA_DA_CATEGORIA" },
          { codigo: "EMPRESA_RECENTE", dias: 3 },
        ],
      },
    });
  });

  it("S5 / S6: regularization URLs are https: on gov.br (contract X4, F14)", async () => {
    const pending = (await readCase(CASE_TOKENS.pendente)).body as {
      resultado: { itens: { url_regularizacao?: string }[] };
    };
    const blocked = (await readCase(CASE_TOKENS.bloqueado)).body as {
      resultado: { motivo: { url_regularizacao: string } };
    };
    const urls = [
      ...pending.resultado.itens.flatMap((item) =>
        item.url_regularizacao === undefined ? [] : [item.url_regularizacao],
      ),
      blocked.resultado.motivo.url_regularizacao,
    ];

    expect(urls.length).toBeGreaterThan(1);
    for (const url of urls) {
      const { protocol, hostname } = new URL(url);
      expect(protocol).toBe("https:");
      expect(hostname === "gov.br" || hostname.endsWith(".gov.br")).toBe(true);
    }
  });

  it("S6: blocked, inapta, with an https regularization URL", async () => {
    const { body } = await readCase(CASE_TOKENS.bloqueado);

    expect(body).toMatchObject({
      estado: "blocked",
      resultado: {
        motivo: {
          codigo: "SITUACAO_IRREGULAR",
          situacao: "inapta",
          url_regularizacao: expect.stringMatching(/^https:\/\//),
        },
      },
    });
  });

  it("S7: verify accepted, processing with the DADOS_NAO_ENCONTRADOS variant right away, with no company data", async () => {
    const token = await createCase("sem-dados");

    const { body } = await readCase(token);

    expect(body).toMatchObject({
      estado: "processing",
      resultado: { variante: "DADOS_NAO_ENCONTRADOS" },
    });
    expect(body.resultado).not.toHaveProperty("razao_social");
    expect(body.resultado).not.toHaveProperty("consultado_em");
  });

  it("S7: a document requested by Renata → pending with the item and no company data", async () => {
    const { body } = await readCase(CASE_TOKENS.semDadosDocumento);

    expect(body).toMatchObject({
      estado: "pending",
      resultado: {
        variante: "DADOS_NAO_ENCONTRADOS",
        responsavel: expect.any(String),
        prazo_revisao: expect.any(String),
        itens: [
          {
            codigo: "DOCUMENTO_SOLICITADO",
            documento_tipo: "CONTRATO_SOCIAL_OU_CCMEI",
            documentos_enviados: 0,
          },
        ],
      },
    });
    expect(body.resultado).not.toHaveProperty("razao_social");
    expect(body.resultado).not.toHaveProperty("consultado_em");
  });

  it("S7: the same case approved → approved without razao_social or consultado_em", async () => {
    const { body } = await readCase(CASE_TOKENS.semDadosAprovado);

    expect(body).toMatchObject({
      estado: "approved",
      resultado: { variante: "DADOS_NAO_ENCONTRADOS" },
    });
    expect(body.resultado).not.toHaveProperty("razao_social");
    expect(body.resultado).not.toHaveProperty("consultado_em");
  });

  it("S10 (held): a fixed case still processing long past the 10 s switch, with no result yet", async () => {
    const { body } = await readCase(CASE_TOKENS.processing);

    expect(body).toEqual({
      estado: "processing",
      criado_em: "2026-10-01T12:00:00.000Z",
    });
  });

  it("S10: still processing past 10 s, approved at 14 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));
    const token = await createCase("lento");

    vi.setSystemTime(new Date("2026-10-03T12:00:11Z"));
    expect((await readCase(token)).body.estado).toBe("processing");

    vi.setSystemTime(new Date("2026-10-03T12:00:14Z"));
    expect((await readCase(token)).body.estado).toBe("approved");
  });

  it("S11: 404 CASO_NAO_ENCONTRADO for an unknown token", async () => {
    const { response, body } = await readCase(CASE_TOKENS.unknown);

    expectErrorEnvelope(response, body, 404, "CASO_NAO_ENCONTRADO");
  });

  it("S11: the same 404 for a real token under another slug", async () => {
    const { response, body } = await readCase(
      CASE_TOKENS.aprovado,
      SLUGS.other,
    );

    expectErrorEnvelope(response, body, 404, "CASO_NAO_ENCONTRADO");
  });

  it("S12: any tokinstavel-<suffix> fails on its own until recovered, then reads as a pending case", async () => {
    const token = `${CASE_TOKENS.unstable}-a1`;
    expectErrorEnvelope(
      (await readCase(token)).response,
      (await readCase(token)).body,
      500,
      "ERRO_INTERNO",
    );

    recoverCase(SLUGS.ok, token);

    const recovered = await readCase(token);
    expect(recovered.response.status).toBe(200);
    expect(recovered.body).toMatchObject({ estado: "pending" });
    expect((await readCase(`${CASE_TOKENS.unstable}-b2`)).response.status).toBe(
      500,
    );
    expect((await readCase(CASE_TOKENS.unstable)).response.status).toBe(500);
  });

  it("the recover control acts only on tokinstavel-<suffix> tokens, and answers 404 otherwise (review 0013)", async () => {
    server.use(...mockControlHandlers);
    const recover = (token: string): Promise<Response> =>
      fetch(`${API}/__mock/links/${SLUGS.ok}/cases/${token}/recover`, {
        method: "POST",
      });

    expect(recoverCase(SLUGS.ok, "tokqualquer0000000000000")).toBe(false);
    expect((await recover("tokqualquer0000000000000")).status).toBe(404);
    expect((await readCase("tokqualquer0000000000000")).response.status).toBe(
      404,
    );
    expect((await recover(CASE_TOKENS.unstable)).status).toBe(404);
    expect((await recover(`${CASE_TOKENS.unstable}-c3`)).status).toBe(204);
  });

  it("S12: 500 when the case read fails", async () => {
    const { response, body } = await readCase(CASE_TOKENS.unstable);

    expectErrorEnvelope(response, body, 500, "ERRO_INTERNO");
  });

  it("S14: every requested document received", async () => {
    const { body } = await readCase(CASE_TOKENS.allReceived);

    const itens = (
      body.resultado as {
        itens: { documento_tipo?: string; documentos_enviados?: number }[];
      }
    ).itens;
    const documents = itens.filter((item) => item.documento_tipo !== undefined);
    expect(documents.length).toBeGreaterThan(0);
    expect(
      documents.every((item) => (item.documentos_enviados ?? 0) >= 1),
    ).toBe(true);
  });

  it("S15: decided by ops after quase lá → blocked GENERICO", async () => {
    const { body } = await readCase(CASE_TOKENS.decided);

    expect(body).toMatchObject({
      estado: "blocked",
      resultado: { motivo: { codigo: "GENERICO" } },
    });
  });

  it.each(Object.entries(CASE_TOKENS))(
    "every fixed token matches X3 (%s)",
    (_name, token) => {
      expect(token).toMatch(TOKEN_PATTERN);
    },
  );
});

describe("D5 contact e-mail", () => {
  it("204, then D4 shows the address masked", async () => {
    const save = await call(
      `/public/v/${SLUGS.ok}/cases/${CASE_TOKENS.pendente}/contact`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "joao@empresa.com.br" }),
      },
    );
    expect(save.response.status).toBe(204);

    const { body } = await readCase(CASE_TOKENS.pendente);
    expect(body).toMatchObject({
      resultado: { email_contato_mascarado: "j•••@empresa.com.br" },
    });
  });

  it("422 EMAIL_INVALIDO with field for an invalid address", async () => {
    const { response, body } = await call(
      `/public/v/${SLUGS.ok}/cases/${CASE_TOKENS.pendente}/contact`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "joao@" }),
      },
    );

    expectErrorEnvelope(response, body, 422, "EMAIL_INVALIDO");
    expect(body.field).toBe("email");
  });

  it("404 CASO_NAO_ENCONTRADO for an unknown token", async () => {
    const { response, body } = await call(
      `/public/v/${SLUGS.ok}/cases/${CASE_TOKENS.unknown}/contact`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "joao@empresa.com.br" }),
      },
    );

    expectErrorEnvelope(response, body, 404, "CASO_NAO_ENCONTRADO");
  });
});

describe("D6 document upload", () => {
  const TEST_ORIGIN = "http://localhost:3000";

  it("answers the CORS preflight for the test origin only", async () => {
    const allowed = await call(
      `/public/v/${SLUGS.ok}/cases/${CASE_TOKENS.pendente}/documents`,
      {
        method: "OPTIONS",
        headers: {
          origin: TEST_ORIGIN,
          "access-control-request-method": "POST",
        },
      },
    );
    expect(allowed.response.status).toBe(204);
    expect(allowed.response.headers.get("access-control-allow-origin")).toBe(
      TEST_ORIGIN,
    );
    expect(allowed.response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(
      allowed.response.headers.get("access-control-allow-credentials"),
    ).toBeNull();

    const other = await call(
      `/public/v/${SLUGS.ok}/cases/${CASE_TOKENS.pendente}/documents`,
      {
        method: "OPTIONS",
        headers: {
          origin: "https://evil.test",
          "access-control-request-method": "POST",
        },
      },
    );
    expect(
      other.response.headers.get("access-control-allow-origin"),
    ).toBeNull();
  });

  it("201 with the running count; photos add pages; CORS headers on the response", async () => {
    const one = await upload(
      CASE_TOKENS.pendente,
      "RESPONSAVEL",
      [jpeg()],
      TEST_ORIGIN,
    );
    expect(one.response.status).toBe(201);
    expect(one.body).toEqual({ tipo: "RESPONSAVEL", documentos_enviados: 1 });
    expect(one.response.headers.get("access-control-allow-origin")).toBe(
      TEST_ORIGIN,
    );
    expect(one.response.headers.get("access-control-expose-headers")).toBe(
      "Retry-After, X-Request-Id",
    );

    const more = await upload(CASE_TOKENS.pendente, "RESPONSAVEL", [
      jpeg("p2.jpg"),
      jpeg("p3.jpg"),
    ]);
    expect(more.body).toEqual({ tipo: "RESPONSAVEL", documentos_enviados: 3 });

    const { body } = await readCase(CASE_TOKENS.pendente);
    expect(body).toMatchObject({
      resultado: {
        itens: expect.arrayContaining([
          expect.objectContaining({
            codigo: "DOCUMENTO_RESPONSAVEL",
            documentos_enviados: 3,
          }),
        ]),
      },
    });
  });

  it("accepts exactly one PDF", async () => {
    const { response, body } = await upload(
      CASE_TOKENS.pendente,
      "RESPONSAVEL",
      [pdf()],
    );

    expect(response.status).toBe(201);
    expect(body.documentos_enviados).toBe(1);
  });

  it.each([
    ["a PDF mixed with photos", [pdf(), jpeg()]],
    ["two PDFs", [pdf("a.pdf"), pdf("b.pdf")]],
    [
      "a file that isn't PDF/JPG/PNG by its bytes",
      [new File(["hello"], "fake.pdf", { type: "application/pdf" })],
    ],
  ])("415 FORMATO_INVALIDO for %s", async (_case, files) => {
    const { response, body } = await upload(
      CASE_TOKENS.pendente,
      "RESPONSAVEL",
      files,
    );

    expectErrorEnvelope(response, body, 415, "FORMATO_INVALIDO");
  });

  it("415 FORMATO_INVALIDO for a PDF added to photos already received", async () => {
    await upload(CASE_TOKENS.pendente, "RESPONSAVEL", [jpeg()]);

    const { response, body } = await upload(
      CASE_TOKENS.pendente,
      "RESPONSAVEL",
      [pdf()],
    );

    expectErrorEnvelope(response, body, 415, "FORMATO_INVALIDO");
  });

  it("413 ARQUIVO_GRANDE past 10 MB in total", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);

    const { response, body } = await upload(
      CASE_TOKENS.pendente,
      "RESPONSAVEL",
      [new File([big], "grande.jpg", { type: "image/jpeg" })],
    );

    expectErrorEnvelope(response, body, 413, "ARQUIVO_GRANDE");
  });

  it("409 CASO_DECIDIDO on a decided case", async () => {
    const { response, body } = await upload(
      CASE_TOKENS.aprovado,
      "RESPONSAVEL",
      [pdf()],
    );

    expectErrorEnvelope(response, body, 409, "CASO_DECIDIDO");
  });

  it.each([
    [UPLOAD_MARKERS.tooLarge, 413, "ARQUIVO_GRANDE"],
    [UPLOAD_MARKERS.badFormat, 415, "FORMATO_INVALIDO"],
    [UPLOAD_MARKERS.decided, 409, "CASO_DECIDIDO"],
    [UPLOAD_MARKERS.rateLimited, 429, "LIMITE_TENTATIVAS"],
  ] as const)(
    "S13: filename marker %s → %i %s",
    async (marker, status, code) => {
      const { response, body } = await upload(
        CASE_TOKENS.pendente,
        "RESPONSAVEL",
        [pdf(`doc${marker}.pdf`)],
      );

      expectErrorEnvelope(response, body, status, code);
    },
  );

  it("S13: the network-drop marker fails at the network level", async () => {
    await expect(
      upload(CASE_TOKENS.pendente, "RESPONSAVEL", [
        pdf(`doc${UPLOAD_MARKERS.networkDrop}.pdf`),
      ]),
    ).rejects.toThrow(TypeError);
  });

  it("404 CASO_NAO_ENCONTRADO for an unknown token", async () => {
    const { response, body } = await upload(
      CASE_TOKENS.unknown,
      "RESPONSAVEL",
      [pdf()],
    );

    expectErrorEnvelope(response, body, 404, "CASO_NAO_ENCONTRADO");
  });
});

describe("mock state", () => {
  it("is reset between tests (uploads from earlier tests are gone)", async () => {
    const { body } = await readCase(CASE_TOKENS.pendente);

    expect(body).toMatchObject({
      resultado: {
        itens: expect.arrayContaining([
          expect.objectContaining({
            codigo: "DOCUMENTO_RESPONSAVEL",
            documentos_enviados: 0,
          }),
        ]),
      },
    });
    expect((body.resultado as Json).email_contato_mascarado).toBeUndefined();
  });
});

describe("per-test case controls (QA test plan G1–G6)", () => {
  // The controls are served by the HTTP mock API only; here they join the
  // Vitest server for this block.
  function useControls(): void {
    server.use(...mockControlHandlers);
  }

  async function control(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<{ response: Response; body: Json }> {
    return call(path, {
      method: init.method,
      ...(init.body !== undefined && {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(init.body),
      }),
    });
  }

  async function newCase(body: Record<string, unknown> = {}): Promise<string> {
    const { response, body: created } = await control("/__mock/cases", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(201);
    return String(created.token);
  }

  it("G1/G3: creates a held case with an X3 token, backdated by ageMs, that stays processing", async () => {
    useControls();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T12:00:00Z"));

    const token = await newCase({ ageMs: 9_000 });

    expect(token).toMatch(TOKEN_PATTERN);
    vi.setSystemTime(new Date("2026-10-03T13:00:00Z"));
    expect((await readCase(token)).body).toEqual({
      estado: "processing",
      criado_em: "2026-10-03T11:59:51.000Z",
    });
  });

  it("G1: creates a case on another slug, from a kind, with a given CNPJ and name", async () => {
    useControls();
    const token = await newCase({
      slug: SLUGS.other,
      kind: "aprovado",
      ageMs: 60_000,
      cnpj: MEI_CNPJS.unmasked,
      responsavel: "Joana Exemplo",
    });

    expect((await readCase(token, SLUGS.other)).body).toMatchObject({
      estado: "approved",
      resultado: {
        razao_social: "JOAO CARLOS SILVA 12345678909",
        responsavel: "Joana Exemplo",
      },
    });
    expect((await readCase(token)).response.status).toBe(404);
  });

  it("G1/G8/G10–G12: serves an explicit estado + resultado verbatim (the presets)", async () => {
    useControls();
    const token = await newCase(CASE_PRESETS.approvedSubset);

    expect((await readCase(token)).body).toMatchObject(
      CASE_PRESETS.approvedSubset,
    );
  });

  it("G2: changes a case's state, then deletes it", async () => {
    useControls();
    const token = await newCase();

    await control(`/__mock/cases/${token}/state`, {
      method: "POST",
      body: { kind: "aprovado" },
    });
    expect((await readCase(token)).body.estado).toBe("approved");

    await control(`/__mock/cases/${token}/state`, {
      method: "POST",
      body: CASE_PRESETS.blockedNoData,
    });
    expect((await readCase(token)).body).toMatchObject(
      CASE_PRESETS.blockedNoData,
    );

    await control(`/__mock/cases/${token}`, { method: "DELETE" });
    expectErrorEnvelope(
      (await readCase(token)).response,
      (await readCase(token)).body,
      404,
      "CASO_NAO_ENCONTRADO",
    );
  });

  it("G4: fails the next n reads with the given status, then reads normally", async () => {
    useControls();
    const token = await newCase();

    await control(`/__mock/cases/${token}/fail`, {
      method: "POST",
      body: { status: 503, times: 2 },
    });

    const first = await readCase(token);
    expectErrorEnvelope(first.response, first.body, 503, "ERRO_INTERNO");
    expect((await readCase(token)).response.status).toBe(503);
    expect((await readCase(token)).response.status).toBe(200);
  });

  it("G5: delays every read of a case", async () => {
    useControls();
    const token = await newCase();
    await control(`/__mock/cases/${token}/delay`, {
      method: "POST",
      body: { ms: 300 },
    });

    const started = Date.now();
    await readCase(token);

    expect(Date.now() - started).toBeGreaterThanOrEqual(290);
  });

  it("G6: counts D4 reads per token string, including failed and unknown ones", async () => {
    useControls();
    const token = await newCase();
    await readCase(token);
    await readCase(token);
    await readCase(CASE_TOKENS.unknown);

    const reads = async (t: string): Promise<unknown> =>
      (await control(`/__mock/cases/${t}/reads`, { method: "GET" })).body;

    expect(await reads(token)).toEqual({ reads: 2 });
    expect(await reads(CASE_TOKENS.unknown)).toEqual({ reads: 1 });
    expect(await reads("curto")).toEqual({ reads: 0 });
  });

  it("rejects a body it can't use, without creating anything", async () => {
    useControls();
    const { response } = await control("/__mock/cases", {
      method: "POST",
      body: { kind: "inexistente" },
    });

    expect(response.status).toBe(400);
  });
});

describe("case presets (QA test plan G8, G10–G12)", () => {
  it("G8: no-data variants never carry razao_social or consultado_em", () => {
    for (const preset of [
      CASE_PRESETS.pendingNoItemsNoData,
      CASE_PRESETS.approvedNoDataOneRow,
      CASE_PRESETS.blockedNoData,
      CASE_PRESETS.blockedNoDataNonGenerico,
    ]) {
      expect(preset.resultado).toMatchObject({
        variante: "DADOS_NAO_ENCONTRADOS",
      });
      expect(preset.resultado).not.toHaveProperty("razao_social");
      expect(preset.resultado).not.toHaveProperty("consultado_em");
    }
    expect(CASE_PRESETS.blockedNoDataNonGenerico.resultado.motivo).not.toEqual({
      codigo: "GENERICO",
    });
  });

  it("G10: the pending catalogue has every item code and every documento_tipo", () => {
    const itens = CASE_PRESETS.pendingCatalogue.resultado.itens;
    const codes = new Set(itens.map((item) => item.codigo));
    const tipos = new Set(itens.flatMap((item) => item.documento_tipo ?? []));

    expect(codes).toEqual(
      new Set([
        "DOCUMENTO_RESPONSAVEL",
        "DOCUMENTO_SOLICITADO",
        "IE_NAO_ENCONTRADA",
        "IE_SUSPENSA",
        "SITUACAO_IRREGULAR",
        "ATIVIDADE_FORA_DA_CATEGORIA",
        "EMPRESA_RECENTE",
        "MEI",
      ]),
    );
    expect(tipos).toEqual(new Set(DOCUMENT_TYPES));
  });

  it("G11: a blocked preset per motivo code, with and without a URL, plus an unknown code", () => {
    expect(Object.keys(CASE_PRESETS.blocked).sort()).toEqual(
      [
        "ATIVIDADE_FORA_DA_CATEGORIA",
        "DESCONHECIDO",
        "EMPRESA_RECENTE",
        "GENERICO",
        "IE_NAO_ENCONTRADA",
        "IE_NAO_ENCONTRADA_SEM_URL",
        "IE_SUSPENSA",
        "MEI",
        "RESPONSAVEL_NAO_SOCIO",
        "SITUACAO_IRREGULAR",
        "SITUACAO_IRREGULAR_SEM_URL",
      ].sort(),
    );
  });

  it("G12: the approved subset returns two rows, out of spec order", () => {
    expect(CASE_PRESETS.approvedSubset.resultado.confirmacoes).toEqual([
      { codigo: "RESPONSAVEL_CONFERE" },
      { codigo: "SITUACAO_ATIVA" },
    ]);
  });

  it.each(["pendingCatalogue", "approvedSubset"] as const)(
    "every regularization URL in %s is on gov.br",
    (name) => {
      const json = JSON.stringify(CASE_PRESETS[name]);
      for (const [, url] of json.matchAll(/"url_regularizacao":"([^"]+)"/g))
        expect(new URL(url ?? "").hostname).toMatch(/(^|\.)gov\.br$/);
    },
  );
});
