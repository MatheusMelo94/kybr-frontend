// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ANALYSIS_TIMEOUT_MS,
  deriveCaseView,
} from "@/features/seller-link/case-view";
import { publicCaseSchema } from "@/lib/api/schemas/public-link";

const CREATED = "2026-10-01T12:00:00.000Z";
const CREATED_MS = Date.parse(CREATED);

const company = {
  razao_social: "Comercial Exemplo Ltda.",
  responsavel: "Maria Exemplo Silva",
  consultado_em: CREATED,
};
const noData = {
  responsavel: "Maria Exemplo Silva",
  variante: "DADOS_NAO_ENCONTRADOS",
};
const documentItem = {
  codigo: "DOCUMENTO_SOLICITADO",
  documento_tipo: "CONTRATO_SOCIAL_OU_CCMEI",
  documentos_enviados: 0,
};

/** A D4 body parsed the way the page gets it. */
function parsed(
  raw: Record<string, unknown>,
): ReturnType<typeof publicCaseSchema.parse> {
  return publicCaseSchema.parse({ criado_em: CREATED, ...raw });
}

const at = (elapsedMs: number): number => CREATED_MS + elapsedMs;

describe("deriveCaseView (plan § 4)", () => {
  it("is verifying, step 2, under 10 s of processing, with the time left until the switch", () => {
    expect(deriveCaseView(parsed({ estado: "processing" }), at(2_500))).toEqual(
      { viewKey: "verifying", step: 2, msUntilTimeout: 7_500 },
    );
  });

  it("switches to analysis-timeout at exactly 10 s", () => {
    expect(ANALYSIS_TIMEOUT_MS).toBe(10_000);
    expect(
      deriveCaseView(parsed({ estado: "processing" }), at(10_000)),
    ).toEqual({ viewKey: "analysis-timeout", step: 2, msUntilTimeout: 0 });
  });

  it("never returns a negative msUntilTimeout", () => {
    expect(
      deriveCaseView(parsed({ estado: "processing" }), at(60_000))
        .msUntilTimeout,
    ).toBe(0);
  });

  it("never waits longer than 10 s, even when criado_em is ahead of the server clock", () => {
    expect(
      deriveCaseView(parsed({ estado: "processing" }), at(-5_000)),
    ).toEqual({ viewKey: "verifying", step: 2, msUntilTimeout: 10_000 });
  });

  describe("DADOS_NAO_ENCONTRADOS (spec v3)", () => {
    it("shows analysis-notfound while processing, even under 10 s: the variant overrides timing", () => {
      expect(
        deriveCaseView(
          parsed({ estado: "processing", resultado: noData }),
          at(1_000),
        ),
      ).toEqual({ viewKey: "analysis-notfound", step: 2, msUntilTimeout: 0 });
    });

    it.each([
      ["no itens", {}],
      ["an empty itens list", { itens: [] }],
    ])("shows analysis-notfound on pending with %s", (_name, extra) => {
      expect(
        deriveCaseView(
          parsed({
            estado: "pending",
            resultado: { ...noData, prazo_revisao: CREATED, ...extra },
          }),
          at(60_000),
        ).viewKey,
      ).toBe("analysis-notfound");
    });

    it("shows pending, step 3, once Renata requests a document", () => {
      expect(
        deriveCaseView(
          parsed({
            estado: "pending",
            resultado: {
              ...noData,
              prazo_revisao: CREATED,
              itens: [documentItem],
            },
          }),
          at(60_000),
        ),
      ).toEqual({ viewKey: "pending", step: 3, msUntilTimeout: 0 });
    });

    it.each(["approved", "blocked"] as const)(
      "shows %s when decided",
      (estado) => {
        expect(
          deriveCaseView(parsed({ estado, resultado: noData }), at(1_000)),
        ).toEqual({ viewKey: estado, step: 3, msUntilTimeout: 0 });
      },
    );
  });

  it.each([
    ["approved", { ...company, confirmacoes: [] }],
    ["pending", { ...company, prazo_revisao: CREATED, itens: [documentItem] }],
    ["blocked", { ...company, motivo: { codigo: "MEI" } }],
  ] as const)("shows %s, step 3, whatever the timing", (estado, resultado) => {
    expect(deriveCaseView(parsed({ estado, resultado }), at(500))).toEqual({
      viewKey: estado,
      step: 3,
      msUntilTimeout: 0,
    });
  });
});
