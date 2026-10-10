// @vitest-environment node
import { describe, expect, it } from "vitest";

import { apiPaths } from "@/lib/api/path";
import {
  alertListSchema,
  monitoringSchema,
} from "@/lib/api/schemas/panel/alerts";

// Synthetic data only.
const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const SELLER_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const CASE_ID = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

const ALERT = {
  id: ID,
  tipo: "SITUACAO_IRREGULAR",
  severidade: "critico",
  seller: {
    id: SELLER_ID,
    razao_social: "Empresa Exemplo Ltda",
    cnpj: "12ABC34501DE35",
  },
  dados: { situacao: "inapta" },
  detectado_em: "2026-10-05T06:10:00-03:00",
  case_id: CASE_ID,
};

const parse = (alert: Record<string, unknown>) =>
  alertListSchema.safeParse([alert]);

describe("alertListSchema (T119, D-M1 + C-M7-1/3)", () => {
  it("accepts every type with exactly its placeholders", () => {
    const cases: [string, string, Record<string, string>][] = [
      ["SITUACAO_IRREGULAR", "critico", { situacao: "baixada" }],
      ["IE_SUSPENSA", "critico", { estado_ie: "cancelada", uf: "SP" }],
      ["RESPONSAVEL_SAIU_QSA", "atencao", { responsavel: "Pessoa Exemplo" }],
      ["QSA_MUDOU", "info", {}],
      ["CNAE_MUDOU", "atencao", { cnae: "47.89-0-99 Comércio varejista" }],
      ["REGIME_MUDOU", "info", { de: "MEI", para: "Simples Nacional" }],
      ["WEBHOOK_FALHOU", "atencao", {}],
    ];
    for (const [tipo, severidade, dados] of cases) {
      const rest = { ...ALERT, case_id: undefined };
      const alert = severidade === "critico" ? { ...ALERT } : rest;
      expect(parse({ ...alert, tipo, severidade, dados }).success, tipo).toBe(
        true,
      );
    }
  });

  it("rejects an unknown tipo or severidade", () => {
    expect(parse({ ...ALERT, tipo: "NOVO_TIPO" }).success).toBe(false);
    expect(parse({ ...ALERT, severidade: "alta" }).success).toBe(false);
  });

  it("rejects dados with a missing, extra or off-enum value", () => {
    expect(parse({ ...ALERT, dados: {} }).success).toBe(false);
    expect(
      parse({ ...ALERT, dados: { situacao: "inapta", extra: "x" } }).success,
    ).toBe(false);
    expect(parse({ ...ALERT, dados: { situacao: "ATIVA" } }).success).toBe(
      false,
    );
    expect(
      parse({
        ...ALERT,
        tipo: "IE_SUSPENSA",
        dados: { estado_ie: "suspensa", uf: "sp" },
      }).success,
    ).toBe(false);
    expect(
      parse({
        ...ALERT,
        tipo: "REGIME_MUDOU",
        severidade: "info",
        case_id: undefined,
        dados: { de: "MEI", para: "Outro" },
      }).success,
    ).toBe(false);
    expect(
      parse({ ...ALERT, tipo: "QSA_MUDOU", dados: { x: "1" } }).success,
    ).toBe(false);
  });

  it("caps the free-text values (A-F2: 120 / 200)", () => {
    const base = { ...ALERT, severidade: "atencao", case_id: undefined };
    expect(
      parse({
        ...base,
        tipo: "RESPONSAVEL_SAIU_QSA",
        dados: { responsavel: "x".repeat(121) },
      }).success,
    ).toBe(false);
    expect(
      parse({ ...base, tipo: "CNAE_MUDOU", dados: { cnae: "x".repeat(201) } })
        .success,
    ).toBe(false);
  });

  it("rejects a case_id that fails isPanelId", () => {
    expect(parse({ ...ALERT, case_id: "../x" }).success).toBe(false);
  });

  it("rejects a case_id on WEBHOOK_FALHOU (C-M7-1)", () => {
    expect(
      parse({
        ...ALERT,
        tipo: "WEBHOOK_FALHOU",
        severidade: "atencao",
        dados: {},
      }).success,
    ).toBe(false);
  });

  it("rejects a CNPJ outside the wire pattern and a non-ISO date", () => {
    expect(
      parse({
        ...ALERT,
        seller: { ...ALERT.seller, cnpj: "12.345.678/0001-95" },
      }).success,
    ).toBe(false);
    expect(parse({ ...ALERT, detectado_em: "05/10/2026" }).success).toBe(false);
    expect(
      parse({ ...ALERT, detectado_em: "2026-10-05T06:10:00" }).success,
    ).toBe(false);
  });

  it("accepts a null razao_social, case_decisao and pedido_aberto", () => {
    const result = parse({
      ...ALERT,
      seller: { ...ALERT.seller, razao_social: null },
      case_decisao: "bloquear",
      pedido_aberto: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.[0]).toMatchObject({
      case_decisao: "bloquear",
      pedido_aberto: true,
    });
    expect(parse({ ...ALERT, case_decisao: "talvez" }).success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = parse({
      ...ALERT,
      mensagem: "MSG-BACKEND-NAO-EXIBIR",
      seller: { ...ALERT.seller, email: "x@exemplo.test" },
    });
    expect(result.success).toBe(true);
    expect(result.data?.[0]).not.toHaveProperty("mensagem");
    expect(result.data?.[0]?.seller).not.toHaveProperty("email");
  });

  it("caps the list at 50 (C-M7-5)", () => {
    expect(
      alertListSchema.safeParse(Array.from({ length: 51 }, () => ALERT))
        .success,
    ).toBe(false);
  });
});

describe("monitoringSchema (T119, D-M2 + C-M7-2)", () => {
  const MON = {
    ativo: true,
    monitorados: 12,
    ultima_varredura: "2026-10-05T06:00:00-03:00",
    proxima_varredura: "2026-10-12T06:00:00-03:00",
  };

  it("accepts C-M7-2, with ultima_varredura absent before the first sweep", () => {
    expect(monitoringSchema.safeParse(MON).success).toBe(true);
    const first = { ...MON, ultima_varredura: undefined };
    expect(monitoringSchema.safeParse(first).success).toBe(true);
    expect(
      monitoringSchema.safeParse({ ativo: false, monitorados: 0 }).success,
    ).toBe(true);
  });

  it("rejects a negative monitorados, and a missing proxima_varredura when monitoring", () => {
    expect(
      monitoringSchema.safeParse({ ...MON, monitorados: -1 }).success,
    ).toBe(false);
    const noNext = { ...MON, proxima_varredura: undefined };
    expect(monitoringSchema.safeParse(noNext).success).toBe(false);
  });
});

describe("apiPaths.panel alerts (T119)", () => {
  it("builds the D-M1 and D-M2 paths", () => {
    expect(apiPaths.panel.alerts()).toBe("/v1/alerts?limit=50");
    expect(apiPaths.panel.monitoring()).toBe("/v1/monitoring");
  });
});
