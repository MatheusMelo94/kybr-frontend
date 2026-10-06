import { z } from "zod";

import {
  DESDE_MAX_AGE_MS,
  NOTA_VENDEDOR_MAX,
} from "@/features/panel-fila/limits";
import {
  DECISAO_TIPOS,
  DOCUMENTO_TIPOS,
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

/**
 * requestDocumentsAction's input (D-C4): 1–5 unique document types and an
 * optional note.
 */
export const requestDocumentsSchema = z
  .object({
    caseId: z.string().refine(isPanelId),
    idempotencyKey: z.uuid(),
    tipos: z
      .array(z.enum(DOCUMENTO_TIPOS))
      .min(1)
      .max(DOCUMENTO_TIPOS.length)
      .refine((tipos) => new Set(tipos).size === tipos.length),
    notaVendedor: z.string().max(NOTA_VENDEDOR_MAX).optional(),
  })
  .strict();

export type RequestDocumentsInput = z.infer<typeof requestDocumentsSchema>;

/**
 * pollNewCasesAction's input (D-C1 `desde`, C-M6-1): the list's gerado_em,
 * an ISO date-time with its offset, at most DESDE_MAX_AGE_MS old.
 */
export const pollNewCasesSchema = z
  .object({
    desde: z.iso
      .datetime({ offset: true })
      .refine((desde) => Date.now() - Date.parse(desde) <= DESDE_MAX_AGE_MS),
  })
  .strict();
