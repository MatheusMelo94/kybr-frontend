// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  caseEventSchema,
  caseListSchema,
  caseSchema,
  newCasesSchema,
  requestDocumentsResultSchema,
} from "@/lib/api/schemas/panel/cases";
import { meSchema } from "@/lib/api/schemas/panel/me";

// Synthetic data only. LINK_HOST is "kybr.test" in the Vitest env.
const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const SELLER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const VERIFICATION_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const DOC_ID = "c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f";
const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

const SUMMARY = {
  id: ID,
  razao_social: "Empresa Exemplo Ltda",
  cnpj: "12ABC34501DE35",
  veredito: "revisar",
  status: "warn",
  motivos: ["CNAE fora da categoria"],
  origem: "link",
  sla_ate: "2026-10-06T18:00:00-03:00",
  vencido: false,
  criado_em: "2026-10-05T10:00:00-03:00",
};

const CASE = {
  ...SUMMARY,
  seller: { id: SELLER_ID, razao_social: "Empresa Exemplo Ltda", cnpj: "12ABC34501DE35" },
  verification: {
    id: VERIFICATION_ID,
    modo: "tempo_real",
    checagens: [
      { chave: "situacao", titulo: "Situação", descricao: "Ativa", valor: "ATIVA", status: "ok" },
      { chave: "cnae", titulo: "Atividade", descricao: "Fora", valor: "4781-4/00", status: "warn" },
    ],
    criado_em: "2026-10-05T10:00:00-03:00",
  },
  estado: "aberto",
  vendedor_tem_email: true,
  eventos: [
    { tipo: "caso_criado", em: "2026-10-05T10:00:00-03:00", dados: { origem: "link" } },
    { tipo: "documento_pedido", em: "2026-10-05T11:00:00-03:00", dados: { tipos: ["CARTAO_CNPJ"] } },
  ],
  documentos: [
    { id: DOC_ID, tipo: "CARTAO_CNPJ", enviado_em: "2026-10-05T12:00:00-03:00", url: "https://docs.exemplo.test/d/1?sig=x" },
  ],
};

describe("caseListSchema (D-C1 + C-M6-1, C-M6-2)", () => {
  it("accepts a page with gerado_em", () => {
    const page = caseListSchema.parse({
      itens: [SUMMARY],
      proximo_cursor: null,
      total: 1,
      gerado_em: "2026-10-06T10:00:00-03:00",
    });
    expect(page.itens[0]?.cnpj).toBe("12ABC34501DE35");
  });

  it("accepts a null razao_social (DADOS_NAO_ENCONTRADOS)", () => {
    expect(
      caseListSchema.safeParse({
        itens: [{ ...SUMMARY, razao_social: null }],
        proximo_cursor: null,
        total: 1,
        gerado_em: "2026-10-06T10:00:00-03:00",
      }).success,
    ).toBe(true);
  });

  it("refuses more than 200 items", () => {
    expect(
      caseListSchema.safeParse({
        itens: Array.from({ length: 201 }, () => SUMMARY),
        proximo_cursor: null,
        total: 201,
        gerado_em: "2026-10-06T10:00:00-03:00",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["veredito", { veredito: "talvez" }],
    ["status", { status: "erro" }],
    ["origem", { origem: "api" }],
    ["CNPJ with punctuation", { cnpj: "12.ABC.345/01DE-35" }],
    ["CNPJ in lowercase", { cnpj: "12abc34501de35" }],
    ["a non-ISO sla_ate", { sla_ate: "06/10/2026" }],
    ["an ISO date without offset", { criado_em: "2026-10-05T10:00:00" }],
    ["a foreign-looking id", { id: "../1" }],
  ])("refuses an item with an unknown %s", (_, patch) => {
    expect(
      caseListSchema.safeParse({
        itens: [{ ...SUMMARY, ...patch }],
        proximo_cursor: null,
        total: 1,
        gerado_em: "2026-10-06T10:00:00-03:00",
      }).success,
    ).toBe(false);
  });
});

describe("newCasesSchema (C-M6-1 desde)", () => {
  it("accepts { novos }", () => {
    expect(newCasesSchema.parse({ novos: 3 })).toEqual({ novos: 3 });
    expect(newCasesSchema.safeParse({ novos: -1 }).success).toBe(false);
  });
});

describe("caseSchema (D-C2 + C-M6-5, C-M6-6)", () => {
  it("accepts the contract's shape", () => {
    const parsed = caseSchema.parse(CASE);
    expect(parsed.verification.checagens).toHaveLength(2);
    expect(parsed.documentos?.[0]?.url).toBe("https://docs.exemplo.test/d/1?sig=x");
  });

  it("F11: strips fields it doesn't know (a future vendedor_email, an event's ator)", () => {
    const parsed = caseSchema.parse({
      ...CASE,
      vendedor_email: "vendedor@exemplo.test",
      eventos: [{ ...CASE.eventos[0], ator: "renata@exemplo.test" }],
    });
    expect(parsed).not.toHaveProperty("vendedor_email");
    expect(parsed.eventos?.[0]).not.toHaveProperty("ator");
  });

  it.each([
    ["estado", { estado: "arquivado" }],
    ["verification.modo", { verification: { ...CASE.verification, modo: "lento" } }],
    [
      "check chave",
      {
        verification: {
          ...CASE.verification,
          checagens: [{ ...CASE.verification.checagens[0], chave: "socios" }],
        },
      },
    ],
    [
      "check status",
      {
        verification: {
          ...CASE.verification,
          checagens: [{ ...CASE.verification.checagens[0], status: "erro" }],
        },
      },
    ],
    ["decisao.tipo", { estado: "decidido", decisao: { tipo: "arquivar", em: "2026-10-06T10:00:00-03:00" } }],
    ["seller CNPJ", { seller: { ...CASE.seller, cnpj: "123" } }],
  ])("refuses an unknown %s", (_, patch) => {
    expect(caseSchema.safeParse({ ...CASE, ...patch }).success).toBe(false);
  });

  it("refuses decisao.tipo = manter on a case that isn't from monitoramento", () => {
    const decided = { estado: "decidido", decisao: { tipo: "manter", em: "2026-10-06T10:00:00-03:00" } };
    expect(caseSchema.safeParse({ ...CASE, ...decided }).success).toBe(false);
    expect(
      caseSchema.safeParse({ ...CASE, ...decided, origem: "monitoramento" }).success,
    ).toBe(true);
  });

  it("caps nota_vendedor at 280", () => {
    const decided = (nota: string) => ({
      ...CASE,
      estado: "decidido",
      decisao: { tipo: "bloquear", em: "2026-10-06T10:00:00-03:00", motivo_codigo: "MEI", nota_vendedor: nota },
    });
    expect(caseSchema.safeParse(decided("a".repeat(280))).success).toBe(true);
    expect(caseSchema.safeParse(decided("a".repeat(281))).success).toBe(false);
  });

  it("partial state: a document with a non-https url drops documentos (fila.detail.partial), not the case", () => {
    const parsed = caseSchema.parse({
      ...CASE,
      documentos: [{ ...CASE.documentos[0], url: "http://docs.exemplo.test/d/1" }],
    });
    expect(parsed.documentos).toBeUndefined();
    expect(parsed.id).toBe(ID);
  });

  it("partial state: an unknown event tipo drops eventos, not the case", () => {
    const parsed = caseSchema.parse({
      ...CASE,
      eventos: [{ tipo: "comentado", em: "2026-10-05T10:00:00-03:00" }],
    });
    expect(parsed.eventos).toBeUndefined();
  });

  it("keeps a valid link_vendedor and drops any other (F8)", () => {
    const good = `https://kybr.test/v/loja-exemplo/c/${TOKEN}`;
    expect(caseSchema.parse({ ...CASE, link_vendedor: good }).link_vendedor).toBe(good);
    expect(
      caseSchema.parse({ ...CASE, link_vendedor: `https://evil.test/v/x/c/${TOKEN}` }).link_vendedor,
    ).toBeUndefined();
  });
});

describe("caseEventSchema (C-M6-5, closed tipo)", () => {
  it.each([
    [{ tipo: "caso_criado", em: "2026-10-05T10:00:00-03:00", dados: { origem: "lote" } }],
    [{ tipo: "documento_recebido", em: "2026-10-05T10:00:00-03:00", dados: { tipo: "RESPONSAVEL" } }],
    [{ tipo: "decidido", em: "2026-10-05T10:00:00-03:00", dados: { decisao: "manter" } }],
    [{ tipo: "reverificado", em: "2026-10-05T10:00:00-03:00" }],
  ])("accepts %j", (event) => {
    expect(caseEventSchema.safeParse(event).success).toBe(true);
  });

  it.each([
    [{ tipo: "comentado", em: "2026-10-05T10:00:00-03:00" }],
    [{ tipo: "documento_pedido", em: "2026-10-05T10:00:00-03:00", dados: { tipos: ["RG"] } }],
    [{ tipo: "decidido", em: "ontem", dados: { decisao: "aprovar" } }],
  ])("refuses %j", (event) => {
    expect(caseEventSchema.safeParse(event).success).toBe(false);
  });
});

describe("requestDocumentsResultSchema (D-C4)", () => {
  it("keeps a valid link_vendedor and drops an invalid one (F8)", () => {
    const good = `https://kybr.test/v/demo/c/${TOKEN}`;
    expect(
      requestDocumentsResultSchema.parse({ case: CASE, link_vendedor: good }).link_vendedor,
    ).toBe(good);
    expect(
      requestDocumentsResultSchema.parse({ case: CASE, link_vendedor: "javascript:alert(1)" })
        .link_vendedor,
    ).toBeUndefined();
  });
});

describe("meSchema, M6 additions (C-M6-3, C-M6-4)", () => {
  const ME = {
    nome: "Renata",
    email: "renata@exemplo.test",
    workspace: {
      nome: "Loja Exemplo",
      slug: "loja-exemplo",
      link_url: "https://kybr.test/v/loja-exemplo",
      contato_vendedor: null,
      categoria: null,
      onboarding_concluido: true,
      webhook_configurado: false,
      contagens: {
        fila_abertos: 30,
        fila_vencidos: 4,
        fila_aguardando: 3,
        alertas_criticos_abertos: 0,
        vendedores: 120,
        lote_em_andamento: false,
      },
      documentos_habilitados: ["CONTRATO_SOCIAL_OU_CCMEI", "CARTAO_CNPJ"],
    },
  };

  it("reads fila_aguardando and documentos_habilitados", () => {
    const me = meSchema.parse(ME);
    expect(me.workspace.contagens?.fila_aguardando).toBe(3);
    expect(me.workspace.documentos_habilitados).toEqual(["CONTRATO_SOCIAL_OU_CCMEI", "CARTAO_CNPJ"]);
  });

  it("a missing or malformed fila_aguardando reads as missing, keeping the other counts", () => {
    const me = meSchema.parse({
      ...ME,
      workspace: { ...ME.workspace, contagens: { ...ME.workspace.contagens, fila_aguardando: -1 } },
    });
    expect(me.workspace.contagens?.fila_abertos).toBe(30);
    expect(me.workspace.contagens?.fila_aguardando).toBeUndefined();
  });

  it.each([
    ["an unknown type", ["RG"]],
    ["an empty list", []],
    ["a repeated type", ["CARTAO_CNPJ", "CARTAO_CNPJ"]],
  ])("documentos_habilitados with %s reads as missing", (_, value) => {
    const me = meSchema.parse({ ...ME, workspace: { ...ME.workspace, documentos_habilitados: value } });
    expect(me.workspace.documentos_habilitados).toBeUndefined();
  });
});
