import { z } from "zod";

import {
  DOCUMENTO_TIPOS,
  POLICY_ACOES,
  POLICY_CHAVES,
  POLICY_DIAS_MAX,
  POLICY_DIAS_MIN,
} from "@/lib/panel-api-values";

// D-R1 GET/PUT /v1/policies/{categoria} (C-M8-6, Pre-Contract). Unknown keys
// or actions fail the parse; so does an action outside the rule's own
// acoes_permitidas (the backend enforces it too, Security O-F7). `dias`
// belongs to `recente` only.

const acao = z.enum(POLICY_ACOES);

export const policyRuleSchema = z
  .object({
    chave: z.enum(POLICY_CHAVES),
    acao,
    acoes_permitidas: z.array(acao).min(1).max(POLICY_ACOES.length),
    dias: z.number().int().min(POLICY_DIAS_MIN).max(POLICY_DIAS_MAX).optional(),
  })
  .refine((regra) => regra.acoes_permitidas.includes(regra.acao), {
    message: "acao outside acoes_permitidas",
  })
  .refine(
    (regra) => (regra.chave === "recente") === (regra.dias !== undefined),
    {
      message: "dias belongs to recente only",
    },
  );

export const policySchema = z.object({
  versao: z.number().int().nonnegative(),
  regras: z
    .array(policyRuleSchema)
    .max(POLICY_CHAVES.length)
    .refine(
      (regras) =>
        new Set(regras.map((regra) => regra.chave)).size === regras.length,
      { message: "repeated chave" },
    ),
  documentos_habilitados: z
    .array(z.enum(DOCUMENTO_TIPOS))
    .max(DOCUMENTO_TIPOS.length),
});

export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type Policy = z.infer<typeof policySchema>;
