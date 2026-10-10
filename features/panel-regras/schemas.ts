import { z } from "zod";

import {
  DOCUMENTO_TIPOS,
  POLICY_ACOES,
  POLICY_CHAVES,
  POLICY_DIAS_MAX,
  POLICY_DIAS_MIN,
} from "@/lib/panel-api-values";

// Regras' Server Action input (plan-m8 D8), authoritative and server-side.
// Strict: an unknown key never reaches the API. O-F7: the keys and actions
// are enums, and dias is an integer 1..3650 on recente only; the backend
// checks each action against the rule's own acoes_permitidas.

const regraSchema = z
  .object({
    chave: z.enum(POLICY_CHAVES),
    acao: z.enum(POLICY_ACOES),
    dias: z.number().int().min(POLICY_DIAS_MIN).max(POLICY_DIAS_MAX).optional(),
  })
  .strict()
  .refine(
    (regra) => (regra.chave === "recente") === (regra.dias !== undefined),
  );

/** savePolicyAction's input: every rule once, the documents, the versao read. */
export const policyDraftSchema = z
  .object({
    versao: z.number().int().nonnegative(),
    regras: z
      .array(regraSchema)
      .length(POLICY_CHAVES.length)
      .refine(
        (regras) =>
          new Set(regras.map((regra) => regra.chave)).size === regras.length,
      ),
    documentos_habilitados: z
      .array(z.enum(DOCUMENTO_TIPOS))
      .max(DOCUMENTO_TIPOS.length)
      .refine((tipos) => new Set(tipos).size === tipos.length),
  })
  .strict()
  // regras.error.nodocs, re-checked here (D8).
  .refine(
    (draft) =>
      draft.documentos_habilitados.length > 0 ||
      draft.regras.every((regra) => regra.acao !== "request"),
  );

export type PolicyDraftInput = z.infer<typeof policyDraftSchema>;
