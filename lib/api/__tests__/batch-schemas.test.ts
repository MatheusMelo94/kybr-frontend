// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  batchHistorySchema,
  batchMonitorSchema,
  batchRowsPageSchema,
  batchSchema,
  batchStartedSchema,
  batchToQueueSchema,
} from "@/lib/api/schemas/panel/batches";

const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const RUNNING = {
  id: ID,
  estado: "processando",
  total: 184,
  processados: 46,
  contagens: { ok: 40, warn: 4, bad: 2, erro: 0 },
  iniciado_em: "2026-10-05T10:00:00-03:00",
  monitorado: false,
  enviado_para_fila: false,
};
const DONE = {
  ...RUNNING,
  estado: "concluido_com_erros",
  processados: 184,
  contagens: { ok: 150, warn: 20, bad: 11, erro: 3 },
  concluido_em: "2026-10-05T10:02:41-03:00",
  casos_criados: 31,
  motivos_contagem: { inapta_baixada: 11, sem_ie: 9, cnae_fora: 4 },
};

describe("batchSchema (D-B2 + C1)", () => {
  it("accepts a running batch and a finished one with motivos_contagem", () => {
    expect(batchSchema.parse(RUNNING).estado).toBe("processando");
    expect(batchSchema.parse(DONE).motivos_contagem).toEqual({
      inapta_baixada: 11,
      sem_ie: 9,
      cnae_fora: 4,
    });
  });

  it.each(["concluido", "concluido_com_erros", "falhou"])(
    "accepts estado %s",
    (estado) => {
      expect(batchSchema.safeParse({ ...DONE, estado }).success).toBe(true);
    },
  );

  it("rejects an unknown estado", () => {
    expect(
      batchSchema.safeParse({ ...RUNNING, estado: "pausado" }).success,
    ).toBe(false);
  });

  it("rejects processados over total", () => {
    expect(
      batchSchema.safeParse({ ...RUNNING, processados: 185 }).success,
    ).toBe(false);
  });

  it("rejects an id outside A-X3 and negative counts", () => {
    expect(batchSchema.safeParse({ ...RUNNING, id: "../x" }).success).toBe(
      false,
    );
    // C10: 16–21 characters isn't a batch id.
    expect(
      batchSchema.safeParse({ ...RUNNING, id: "lote_ABCDEFGHIJKLMNOP" })
        .success,
    ).toBe(false);
    expect(
      batchSchema.safeParse({
        ...RUNNING,
        contagens: { ...RUNNING.contagens, ok: -1 },
      }).success,
    ).toBe(false);
  });

  it("a malformed motivos_contagem reads as missing (the generic card)", () => {
    const parsed = batchSchema.parse({
      ...DONE,
      motivos_contagem: { inapta_baixada: "x" },
    });
    expect(parsed.motivos_contagem).toBeUndefined();
  });
});

describe("batchRowsPageSchema (D-B3 + C2)", () => {
  const ROW = {
    cnpj: "12ABC34501DE35",
    razao_social: "Empresa Exemplo Ltda",
    status: "warn",
    motivos: ["Sem inscrição estadual"],
  };

  it("accepts an A-X6 page", () => {
    const page = batchRowsPageSchema.parse({
      itens: [
        ROW,
        {
          cnpj: "11222333000181",
          status: "erro",
          motivos: [],
          erro_codigo: "TIMEOUT",
        },
      ],
      proximo_cursor: null,
      total: 2,
    });
    expect(page.itens).toHaveLength(2);
    expect(page.itens[1]?.razao_social).toBeUndefined();
  });

  it("rejects an unknown status and a CNPJ outside the wire pattern", () => {
    for (const row of [
      { ...ROW, status: "ignorado" },
      { ...ROW, cnpj: "12.ABC.345/01DE-35" },
      { ...ROW, cnpj: "12abc34501de35" },
      { ...ROW, cnpj: "12ABC34501DEXX" },
    ])
      expect(
        batchRowsPageSchema.safeParse({
          itens: [row],
          proximo_cursor: null,
          total: 1,
        }).success,
      ).toBe(false);
  });
});

describe("batchHistorySchema (D-B6)", () => {
  it("accepts newest-first entries and rejects an unknown estado", () => {
    const entry = {
      id: ID,
      total: 184,
      estado: "concluido",
      iniciado_em: "2026-10-05T10:00:00-03:00",
      concluido_em: "2026-10-05T10:02:41-03:00",
    };
    expect(batchHistorySchema.parse([entry])).toHaveLength(1);
    expect(
      batchHistorySchema.safeParse([{ ...entry, estado: "x" }]).success,
    ).toBe(false);
  });
});

describe("write results (D-B1, D-B5)", () => {
  it("start answers an A-X3 id; to-queue and monitor answer counts", () => {
    expect(batchStartedSchema.parse({ id: ID }).id).toBe(ID);
    expect(batchStartedSchema.safeParse({ id: "x" }).success).toBe(false);
    expect(batchToQueueSchema.parse({ criados: 31 }).criados).toBe(31);
    expect(batchMonitorSchema.parse({ monitorados: 181 }).monitorados).toBe(
      181,
    );
  });
});
