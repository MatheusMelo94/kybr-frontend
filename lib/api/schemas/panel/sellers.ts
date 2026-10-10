import { z } from "zod";

import { verificationSchema } from "@/lib/api/schemas/panel/cases";
import {
  SELLER_ORIGENS,
  SELLER_STATUSES,
  VEREDITOS,
  isPanelId,
} from "@/lib/panel-api-values";

// M8 sellers, D-S1–D-S3 (C-M8-2–C-M8-4, Pre-Contract). Like M6's cases:
// unknown enum values, ids or CNPJs fail the parse (INVALID_RESPONSE), and
// objects strip fields they don't know. The CNPJ (and any CPF in a MEI
// razão social) is masked by the data layer after the parse (O-F4).

const panelId = z.string().refine(isPanelId);
const count = z.number().int().nonnegative();
const cnpj = z.string().regex(/^[0-9A-Z]{12}[0-9]{2}$/); // A-X5
/** ISO 8601 with an offset or Z (A-X5). */
const isoDateTime = z.iso.datetime({ offset: true });
const text = (max: number) => z.string().max(max);

/** D-S1 row. */
export const sellerRowSchema = z.object({
  id: panelId,
  razao_social: text(300).nullable(),
  cnpj,
  responsavel: text(300).optional(),
  origem: z.enum(SELLER_ORIGENS),
  verificado_em: isoDateTime,
  status: z.enum(SELLER_STATUSES),
  /** Display-ready ("inapta"), shown as `sellers.status.changed`. */
  mudou: z.object({ resumo: text(60) }).optional(),
  monitorado: z.boolean(),
  reverificacao_pendente: z.boolean().optional(),
});

/** D-S1 page: 50 per page, numbered (plan-m8 D5). */
export const sellerListSchema = z.object({
  itens: z.array(sellerRowSchema).max(50),
  total: count,
  pagina: z.number().int().min(1),
  paginas: count,
});

/** D-S2: the row + M6's verification + the history + the open case. */
export const sellerSchema = sellerRowSchema.extend({
  /** G9: absent should be impossible; the page then hides the block. */
  verificacao_atual: verificationSchema.optional(),
  verificacoes: z
    .array(
      z.object({
        id: panelId,
        veredito: z.enum(VEREDITOS),
        criado_em: isoDateTime,
      }),
    )
    .max(20),
  case_aberto_id: panelId.optional(),
});

/** D-S3 202. */
export const reverifyResultSchema = z.object({
  reverificacao_pendente: z.literal(true),
});

export type SellerRow = z.infer<typeof sellerRowSchema>;
export type SellerList = z.infer<typeof sellerListSchema>;
export type Seller = z.infer<typeof sellerSchema>;
