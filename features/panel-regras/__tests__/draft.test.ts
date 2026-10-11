import { describe, expect, it } from "vitest";

import {
  draftInput,
  invalidDias,
  isDirty,
  nodocsOffenders,
  toDraft,
  type Draft,
} from "@/features/panel-regras/draft";
import type { Policy } from "@/lib/api/schemas/panel/policies";

// T144 (plan-m8 D8): the Regras draft over the server copy. Dirty when it
// differs; nodocs when a rule asks for documents and none is enabled.

const POLICY: Policy = {
  versao: 3,
  regras: [
    { chave: "ok", acao: "auto", acoes_permitidas: ["auto", "review"] },
    {
      chave: "recente",
      acao: "review",
      acoes_permitidas: ["review", "request", "block"],
      dias: 90,
    },
    {
      chave: "situacao",
      acao: "block",
      acoes_permitidas: ["review", "block"],
    },
  ],
  documentos_habilitados: ["CARTAO_CNPJ"],
};

describe("Regras draft", () => {
  it("toDraft: the rules in the spec's order, Tudo certo last; dias as text", () => {
    const draft = toDraft(POLICY);
    expect(draft.regras.map((regra) => regra.chave)).toEqual([
      "situacao",
      "recente",
      "ok",
    ]);
    expect(draft.regras[1]).toMatchObject({ dias: "90" });
    expect(draft.documentos).toEqual(["CARTAO_CNPJ"]);
  });

  it("isDirty: a change is dirty; reverting it is clean again", () => {
    const server = toDraft(POLICY);
    const changed: Draft = {
      ...server,
      regras: server.regras.map((regra) =>
        regra.chave === "situacao" ? { ...regra, acao: "review" } : regra,
      ),
    };
    expect(isDirty(server, server)).toBe(false);
    expect(isDirty(changed, server)).toBe(true);
    expect(isDirty({ ...changed, regras: server.regras }, server)).toBe(false);
    expect(
      isDirty({ ...server, documentos: ["CARTAO_CNPJ", "PROCURACAO"] }, server),
    ).toBe(true);
    // The same set in another order is the same policy.
    const two = { ...server, documentos: ["PROCURACAO", "CARTAO_CNPJ"] };
    expect(
      isDirty(two as Draft, {
        ...server,
        documentos: ["CARTAO_CNPJ", "PROCURACAO"],
      }),
    ).toBe(false);
  });

  it("nodocsOffenders: the rules on Pedir documento when no document is enabled", () => {
    const server = toDraft(POLICY);
    const asking: Draft = {
      ...server,
      documentos: [],
      regras: server.regras.map((regra) =>
        regra.chave === "recente" ? { ...regra, acao: "request" } : regra,
      ),
    };
    expect(nodocsOffenders(asking)).toEqual(["recente"]);
    expect(nodocsOffenders({ ...asking, documentos: ["PROCURACAO"] })).toEqual(
      [],
    );
  });

  it("invalidDias: recente's days must be a whole number 1..3650", () => {
    const server = toDraft(POLICY);
    const withDias = (dias: string): Draft => ({
      ...server,
      regras: server.regras.map((regra) =>
        regra.chave === "recente" ? { ...regra, dias } : regra,
      ),
    });
    expect(invalidDias(withDias("90"))).toBe(false);
    for (const bad of ["", "0", "3651", "1.5", "-2", "abc"])
      expect(invalidDias(withDias(bad))).toBe(true);
  });

  it("draftInput: savePolicyAction's input, with versao and numeric dias", () => {
    expect(draftInput(toDraft(POLICY))).toEqual({
      versao: 3,
      regras: [
        { chave: "situacao", acao: "block" },
        { chave: "recente", acao: "review", dias: 90 },
        { chave: "ok", acao: "auto" },
      ],
      documentos_habilitados: ["CARTAO_CNPJ"],
    });
  });
});
