// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CASE_TOKENS,
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
import { recoverLink } from "@/tests/fixtures/msw/handlers/seller-link";

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

  it("S7: verify accepted, processing with the DADOS_NAO_ENCONTRADOS variant right away", async () => {
    const token = await createCase("sem-dados");

    const { body } = await readCase(token);

    expect(body).toMatchObject({
      estado: "processing",
      resultado: { variante: "DADOS_NAO_ENCONTRADOS" },
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
