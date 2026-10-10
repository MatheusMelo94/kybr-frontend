// @vitest-environment node
import { describe, expect, it } from "vitest";

import { policySchema } from "@/lib/api/schemas/panel/policies";
import {
  reverifyResultSchema,
  sellerListSchema,
  sellerSchema,
} from "@/lib/api/schemas/panel/sellers";

// T137: D-S1–D-S3 (C-M8-2–C-M8-4) and D-R1 (C-M8-6), Pre-Contract.
// Synthetic data only.
const SELLER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const VERIFICATION_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const CASE_ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const ROW = {
  id: SELLER_ID,
  razao_social: "Empresa Exemplo Ltda",
  cnpj: "12345678000195",
  responsavel: "Pessoa Exemplo",
  origem: "link",
  verificado_em: "2026-10-05T10:00:00-03:00",
  status: "mudou",
  mudou: { resumo: "inapta" },
  monitorado: true,
  reverificacao_pendente: false,
};

const DETAIL = {
  ...ROW,
  verificacao_atual: {
    id: VERIFICATION_ID,
    modo: "cache",
    checagens: [
      {
        chave: "situacao",
        titulo: "Situação",
        descricao: "Inapta",
        valor: "INAPTA",
        status: "bad",
      },
    ],
    criado_em: "2026-10-05T10:00:00-03:00",
  },
  verificacoes: [
    {
      id: VERIFICATION_ID,
      veredito: "bloquear",
      criado_em: "2026-10-05T10:00:00-03:00",
    },
  ],
  case_aberto_id: CASE_ID,
};

const LIST = { itens: [ROW], total: 1, pagina: 1, paginas: 1 };

describe("sellerListSchema (D-S1, C-M8-2)", () => {
  it("parses a page", () => {
    expect(sellerListSchema.parse(LIST)).toMatchObject(LIST);
  });

  it("accepts a row without the optional fields and a null razão social", () => {
    const {
      responsavel: _r,
      mudou: _m,
      reverificacao_pendente: _p,
      ...bare
    } = ROW;
    const row = { ...bare, razao_social: null, status: "aprovado" };
    expect(sellerListSchema.safeParse({ ...LIST, itens: [row] }).success).toBe(
      true,
    );
  });

  it("an empty page", () => {
    expect(
      sellerListSchema.safeParse({ itens: [], total: 0, pagina: 1, paginas: 0 })
        .success,
    ).toBe(true);
  });

  it.each([
    ["an unknown status", { status: "suspenso" }],
    ["an unknown origem", { origem: "monitoramento" }],
    ["a non-isPanelId id", { id: "curto" }],
    ["a bad CNPJ", { cnpj: "12.345.678/0001-95" }],
    ["a short CNPJ", { cnpj: "1234567800019" }],
    ["mudou.resumo over 60", { mudou: { resumo: "x".repeat(61) } }],
    ["mudou.resumo not a string", { mudou: { resumo: 1 } }],
    ["a bad verificado_em", { verificado_em: "ontem" }],
  ])("rejects %s", (_name, patch) => {
    expect(
      sellerListSchema.safeParse({ ...LIST, itens: [{ ...ROW, ...patch }] })
        .success,
    ).toBe(false);
  });

  it("mudou.resumo of exactly 60 passes", () => {
    const row = { ...ROW, mudou: { resumo: "x".repeat(60) } };
    expect(sellerListSchema.safeParse({ ...LIST, itens: [row] }).success).toBe(
      true,
    );
  });

  it("rejects more than 50 rows and a pagina below 1", () => {
    expect(
      sellerListSchema.safeParse({
        ...LIST,
        itens: Array.from({ length: 51 }, () => ROW),
      }).success,
    ).toBe(false);
    expect(sellerListSchema.safeParse({ ...LIST, pagina: 0 }).success).toBe(
      false,
    );
  });
});

describe("sellerSchema (D-S2, C-M8-3)", () => {
  it("parses the detail with M6's verification shape", () => {
    expect(sellerSchema.parse(DETAIL)).toMatchObject(DETAIL);
  });

  it("G9: no verificacao_atual and no open case still parse", () => {
    const { verificacao_atual: _v, case_aberto_id: _c, ...rest } = DETAIL;
    expect(sellerSchema.safeParse(rest).success).toBe(true);
  });

  it.each([
    ["a non-isPanelId id", { id: "x" }],
    ["a bad case_aberto_id", { case_aberto_id: "caso-1" }],
    [
      "an unknown check chave (M6's schema)",
      {
        verificacao_atual: {
          ...DETAIL.verificacao_atual,
          checagens: [{ ...DETAIL.verificacao_atual.checagens[0], chave: "x" }],
        },
      },
    ],
    [
      "an unknown history veredito",
      { verificacoes: [{ ...DETAIL.verificacoes[0], veredito: "talvez" }] },
    ],
    [
      "more than 20 history items",
      {
        verificacoes: Array.from({ length: 21 }, () => DETAIL.verificacoes[0]),
      },
    ],
  ])("rejects %s", (_name, patch) => {
    expect(sellerSchema.safeParse({ ...DETAIL, ...patch }).success).toBe(false);
  });
});

describe("reverifyResultSchema (D-S3, C-M8-4)", () => {
  it("accepts { reverificacao_pendente: true } only", () => {
    expect(
      reverifyResultSchema.safeParse({ reverificacao_pendente: true }).success,
    ).toBe(true);
    expect(
      reverifyResultSchema.safeParse({ reverificacao_pendente: false }).success,
    ).toBe(false);
  });
});

const ALL = ["auto", "approve", "approve_limit", "review", "request", "block"];
const POLICY = {
  versao: 3,
  regras: [
    { chave: "situacao", acao: "block", acoes_permitidas: ["review", "block"] },
    { chave: "recente", acao: "review", acoes_permitidas: ALL, dias: 90 },
    { chave: "qsa", acao: "request", acoes_permitidas: ALL },
    { chave: "cnae", acao: "review", acoes_permitidas: ALL },
    { chave: "ie", acao: "approve_limit", acoes_permitidas: ALL },
    { chave: "mei", acao: "approve", acoes_permitidas: ALL },
    { chave: "ok", acao: "auto", acoes_permitidas: ["auto", "review"] },
  ],
  documentos_habilitados: ["CONTRATO_SOCIAL_OU_CCMEI", "PROCURACAO"],
};
const rule = (index: number, patch: Record<string, unknown>) => ({
  ...POLICY,
  regras: POLICY.regras.map((regra, i) =>
    i === index ? { ...regra, ...patch } : regra,
  ),
});

describe("policySchema (D-R1, C-M8-6)", () => {
  it("parses a policy", () => {
    expect(policySchema.parse(POLICY)).toMatchObject(POLICY);
  });

  it("dias at 1 and 3650 pass", () => {
    expect(policySchema.safeParse(rule(1, { dias: 1 })).success).toBe(true);
    expect(policySchema.safeParse(rule(1, { dias: 3650 })).success).toBe(true);
  });

  it.each([
    ["an unknown rule chave", rule(0, { chave: "capital" })],
    ["an unknown acao", rule(3, { acao: "ignorar" })],
    ["an unknown acoes_permitidas item", rule(3, { acoes_permitidas: ["x"] })],
    ["an acao outside acoes_permitidas (O-F7)", rule(0, { acao: "auto" })],
    ["dias 0", rule(1, { dias: 0 })],
    ["dias 3651", rule(1, { dias: 3651 })],
    ["dias not an integer", rule(1, { dias: 1.5 })],
    ["recente without dias", rule(1, { dias: undefined })],
    ["dias on another rule", rule(2, { dias: 30 })],
    ["a repeated chave", rule(2, { chave: "situacao" })],
    ["an unknown documento", { ...POLICY, documentos_habilitados: ["RG"] }],
    ["a negative versao", { ...POLICY, versao: -1 }],
  ])("rejects %s", (_name, value) => {
    expect(policySchema.safeParse(value).success).toBe(false);
  });
});
