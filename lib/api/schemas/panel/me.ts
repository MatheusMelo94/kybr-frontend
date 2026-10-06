import { z } from "zod";

import { DOCUMENTO_TIPOS } from "@/lib/panel-api-values";

// D-W1 GET /v1/me (Pre-Contract). `plano` and `contagens` may be missing when
// the backend fails to compute them; a malformed one is treated as missing
// too, so the shell hides it instead of failing the page (spec S5, AC 11).

const planoSchema = z.object({
  tipo: z.enum(["teste", "pago"]),
  nome: z.string().max(80).optional(),
  usadas: z.number().int().nonnegative(),
  limite: z.number().int().nonnegative(),
  ciclo_ate: z.string().optional(),
});

const contagensSchema = z.object({
  fila_abertos: z.number().int().nonnegative(),
  fila_vencidos: z.number().int().nonnegative(),
  // C-M6-3 (M6): missing or malformed hides only the waiting tab's count.
  fila_aguardando: z.number().int().nonnegative().optional().catch(undefined),
  alertas_criticos_abertos: z.number().int().nonnegative(),
  vendedores: z.number().int().nonnegative(),
  lote_em_andamento: z.boolean(),
});

export const workspaceSchema = z.object({
  nome: z.string(),
  slug: z.string(),
  link_url: z.string(),
  contato_vendedor: z
    .object({ tipo: z.enum(["email", "url"]), valor: z.string() })
    .nullable(),
  categoria: z.string().nullable(),
  onboarding_concluido: z.boolean(),
  webhook_configurado: z.boolean(),
  plano: planoSchema.optional().catch(undefined),
  contagens: contagensSchema.optional().catch(undefined),
  // C-M6-4 (M6): the types Pedir documento offers (≥ 1, no repeats).
  documentos_habilitados: z
    .array(z.enum(DOCUMENTO_TIPOS))
    .min(1)
    .max(DOCUMENTO_TIPOS.length)
    .refine((tipos) => new Set(tipos).size === tipos.length)
    .optional()
    .catch(undefined),
});

export const meSchema = z.object({
  nome: z.string(),
  email: z.string(),
  workspace: workspaceSchema,
});

export type Me = z.infer<typeof meSchema>;
export type Plano = z.infer<typeof planoSchema>;
export type Contagens = z.infer<typeof contagensSchema>;
