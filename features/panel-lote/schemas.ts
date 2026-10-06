import { z } from "zod";

import {
  MAX_ROWS,
  isBatchId,
  isValidExtId,
  isValidResponsavel,
  isWireCnpj,
} from "@/features/panel-lote/validation";

// startBatchAction's input (ADR-0012 item 8), authoritative and server-side,
// built from the same functions the worker uses (validation.ts), so the two
// accept and reject the same rows (ADR-0010 Addendum 1 rule 8).

/** One D-B1 row (contract C4). Strict: nothing else reaches the API. */
export const linhaSchema = z
  .object({
    cnpj: z.string().refine(isWireCnpj),
    responsavel: z.string().refine(isValidResponsavel).optional(),
    ext_id: z.string().refine(isValidExtId).optional(),
  })
  .strict();

export const startBatchSchema = z
  .object({
    idempotencyKey: z.uuid(),
    linhas: z
      .array(linhaSchema)
      .min(1)
      .max(MAX_ROWS)
      .refine(
        (linhas) =>
          new Set(linhas.map((linha) => linha.cnpj)).size === linhas.length,
        { message: "duplicate cnpj" },
      ),
  })
  .strict();

export type StartBatchInput = z.infer<typeof startBatchSchema>;

/** A batch action's input (poll, to-queue, monitor, resume): an A-X3/C10 id only. */
export const batchRefSchema = z
  .object({ batchId: z.string().refine(isBatchId) })
  .strict();

/** to-queue / monitor (D-B5): the batch and the button's Idempotency-Key (A-X7). */
export const batchWriteSchema = z
  .object({ batchId: z.string().refine(isBatchId), idempotencyKey: z.uuid() })
  .strict();
