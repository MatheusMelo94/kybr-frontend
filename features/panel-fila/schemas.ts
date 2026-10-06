import { z } from "zod";

import { NOTA_VENDEDOR_MAX } from "@/features/panel-fila/limits";
import {
  DECISAO_TIPOS,
  MOTIVO_CODIGOS,
  isPanelId,
} from "@/lib/panel-api-values";

// The Fila's Server Action inputs (plan-m6 § 3.2), authoritative and
// server-side. Strict: an unknown key never reaches the API.

/**
 * decideAction's input: a reason exactly when blocking, and a note only
 * with a block (D-C3).
 */
export const decideSchema = z
  .object({
    caseId: z.string().refine(isPanelId),
    idempotencyKey: z.uuid(),
    decisao: z.enum(DECISAO_TIPOS),
    motivoCodigo: z.enum(MOTIVO_CODIGOS).optional(),
    notaVendedor: z.string().max(NOTA_VENDEDOR_MAX).optional(),
  })
  .strict()
  .refine((input) =>
    input.decisao === "bloquear"
      ? input.motivoCodigo !== undefined
      : input.motivoCodigo === undefined && input.notaVendedor === undefined,
  );

export type DecideInput = z.infer<typeof decideSchema>;
