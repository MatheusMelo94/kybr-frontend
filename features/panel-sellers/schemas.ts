import { z } from "zod";

import { auditRangeOk } from "@/features/panel-sellers/audit-range";
import {
  SELLER_QUERY_MAX,
  SELLER_STATUSES,
  isPanelId,
} from "@/lib/panel-api-values";

// Vendedores' Server Action input (plan-m8 D6), authoritative and
// server-side. Strict: an unknown key never reaches the API.

/** reverifyAction's input: the seller and the intent's Idempotency-Key. */
export const reverifySchema = z
  .object({
    sellerId: z.string().refine(isPanelId),
    idempotencyKey: z.uuid(),
  })
  .strict();

export type ReverifyInput = z.infer<typeof reverifySchema>;

/** The sellers export's query (O-F5): the list's q (≤ 100) and status only. */
export const sellersExportSchema = z
  .object({
    q: z.string().max(SELLER_QUERY_MAX).optional(),
    status: z.enum(SELLER_STATUSES).optional(),
  })
  .strict();

/** The audit export's period: real days, de ≤ ate, at most 12 months (G11). */
export const auditExportSchema = z
  .object({ de: z.string(), ate: z.string() })
  .strict()
  .refine(({ de, ate }) => auditRangeOk(de, ate));
