import type { Policy } from "@/lib/api/schemas/panel/policies";
import {
  POLICY_CHAVES,
  POLICY_DIAS_MAX,
  POLICY_DIAS_MIN,
  type DocumentoTipo,
  type PolicyAcao,
} from "@/lib/panel-api-values";

// Regras' client draft over the server policy (plan-m8 D8). Plain code, no
// zod: PolicyForm (a client leaf) holds it in local state only (O-F9); the
// Server Action's schema re-checks everything.

type Chave = (typeof POLICY_CHAVES)[number];

export type DraftRule = {
  chave: Chave;
  acao: PolicyAcao;
  acoes_permitidas: readonly PolicyAcao[];
  /** recente only, as typed (the input's text). */
  dias?: string;
};

export type Draft = {
  versao: number;
  regras: DraftRule[];
  documentos: DocumentoTipo[];
};

/** The server copy as a draft: the spec's order (POLICY_CHAVES), "ok" last. */
export function toDraft(policy: Policy): Draft {
  const order = (chave: Chave) => POLICY_CHAVES.indexOf(chave);
  return {
    versao: policy.versao,
    regras: [...policy.regras]
      .sort((a, b) => order(a.chave) - order(b.chave))
      .map(({ chave, acao, acoes_permitidas, dias }) => ({
        chave,
        acao,
        acoes_permitidas,
        ...(dias !== undefined && { dias: String(dias) }),
      })),
    documentos: [...policy.documentos_habilitados],
  };
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item));

/** The draft differs from the server copy (the save bar's condition). */
export function isDirty(draft: Draft, server: Draft): boolean {
  if (!sameSet(draft.documentos, server.documentos)) return true;
  return draft.regras.some((regra) => {
    const original = server.regras.find((item) => item.chave === regra.chave);
    return regra.acao !== original?.acao || regra.dias !== original.dias;
  });
}

/** regras.error.nodocs: the rules on "Pedir documento" with no document enabled. */
export function nodocsOffenders(draft: Draft): Chave[] {
  if (draft.documentos.length > 0) return [];
  return draft.regras
    .filter((regra) => regra.acao === "request")
    .map((regra) => regra.chave);
}

/** recente's days aren't a whole number in POLICY_DIAS_MIN..MAX. */
export function invalidDias(draft: Draft): boolean {
  return draft.regras.some((regra) => {
    if (regra.dias === undefined) return false;
    if (!/^\d+$/.test(regra.dias)) return true;
    const dias = Number(regra.dias);
    return dias < POLICY_DIAS_MIN || dias > POLICY_DIAS_MAX;
  });
}

/** savePolicyAction's input: the whole policy with the versao read. */
export function draftInput(draft: Draft): {
  versao: number;
  regras: { chave: Chave; acao: PolicyAcao; dias?: number }[];
  documentos_habilitados: DocumentoTipo[];
} {
  return {
    versao: draft.versao,
    regras: draft.regras.map(({ chave, acao, dias }) => ({
      chave,
      acao,
      ...(dias !== undefined && { dias: Number(dias) }),
    })),
    documentos_habilitados: [...draft.documentos],
  };
}
