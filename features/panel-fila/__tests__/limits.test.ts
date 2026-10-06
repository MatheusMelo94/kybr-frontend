import { describe, expect, it } from "vitest";

import {
  DECIDE_TIMEOUT_MS,
  documentosHabilitados,
} from "@/features/panel-fila/limits";
import { DEFAULT_DOCUMENTOS } from "@/tests/fixtures/factories/panel";
import {
  FILA_NEW_CASES_INTERVAL_MS,
  POLL_TIMEOUT_MS,
} from "@/features/panel-shell/polling";

describe("the Fila's cadences and bounds", () => {
  it("polls for new cases every 60 s, with the shared 4 s poll timeout (ADR-0011 rule 3)", () => {
    expect(FILA_NEW_CASES_INTERVAL_MS).toBe(60_000);
    expect(POLL_TIMEOUT_MS).toBe(4_000);
  });

  it("F6: a decision with no result in 15 s is an unknown outcome", () => {
    expect(DECIDE_TIMEOUT_MS).toBe(15_000);
  });

  it("P6-008 (spec J4, plan G10): /me without documentos_habilitados → the default four, every type but PROCURACAO, in the mock's order", () => {
    expect(documentosHabilitados(undefined)).toEqual([
      "CONTRATO_SOCIAL_OU_CCMEI",
      "COMPROVANTE_ENDERECO",
      "CARTAO_CNPJ",
      "RESPONSAVEL",
    ]);
    expect(documentosHabilitados(undefined)).toEqual(DEFAULT_DOCUMENTOS);
  });

  it("P6-008: /me's list wins when present", () => {
    expect(documentosHabilitados(["PROCURACAO"])).toEqual(["PROCURACAO"]);
  });
});
