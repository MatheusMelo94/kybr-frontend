import { z } from "zod";

import { isPanelId } from "@/lib/panel-api-values";

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
