import { z } from "zod";

import { BATCH_ROW_STATUSES, isBatchId } from "@/lib/panel-api-values";

// M5 batches, D-B1–D-B7 + the M5 additions C1–C2 (Pre-Contract). Unknown
// states, statuses or ids fail the parse (INVALID_RESPONSE), never render.

const batchIdSchema = z.string().refine(isBatchId);
const count = z.number().int().nonnegative();
const CNPJ_WIRE = /^[0-9A-Z]{12}[0-9]{2}$/; // A-X5

export const BATCH_STATES = [
  "processando",
  "concluido",
  "concluido_com_erros",
  "falhou",
] as const;

/** D-B1 201 */
/** P5-003: an ISO 8601 date-time with an offset or Z (Pre-Contract format). */
const isoDateTime = z.iso.datetime({ offset: true });

export const batchStartedSchema = z.object({ id: batchIdSchema });

/** D-B2 (+ C1 `motivos_contagem` on concluido*). */
export const batchSchema = z
  .object({
    id: batchIdSchema,
    estado: z.enum(BATCH_STATES),
    total: count,
    processados: count,
    contagens: z.object({ ok: count, warn: count, bad: count, erro: count }),
    iniciado_em: isoDateTime,
    concluido_em: isoDateTime.optional(),
    monitorado: z.boolean(),
    enviado_para_fila: z.boolean(),
    casos_criados: count.optional(),
    // A malformed breakdown reads as missing: the result shows the generic
    // "O que isso resolve" card instead of failing the page.
    motivos_contagem: z
      .object({ inapta_baixada: count, sem_ie: count, cnae_fora: count })
      .optional()
      .catch(undefined),
  })
  .refine((batch) => batch.processados <= batch.total, {
    message: "processados > total",
  });

/** D-B3 row: the CNPJ in the wire format (masked on screen), razao_social as given. */
export const batchRowSchema = z.object({
  cnpj: z.string().regex(CNPJ_WIRE),
  razao_social: z.string().max(300).optional(),
  status: z.enum(BATCH_ROW_STATUSES),
  motivos: z.array(z.string().max(300)).max(50),
  erro_codigo: z.string().max(64).optional(),
});

/** D-B3 page (A-X6 + C2): file order, ≤ 25, `total` per filter. */
export const batchRowsPageSchema = z.object({
  itens: z.array(batchRowSchema).max(25),
  proximo_cursor: z.string().max(256).nullable(),
  total: count,
});

/** D-B6: newest first, at most 10. */
export const batchHistorySchema = z
  .array(
    z.object({
      id: batchIdSchema,
      total: count,
      estado: z.enum(BATCH_STATES),
      iniciado_em: isoDateTime,
      concluido_em: isoDateTime.optional(),
    }),
  )
  .max(10);

/** D-B5 */
export const batchToQueueSchema = z.object({ criados: count });
export const batchMonitorSchema = z.object({ monitorados: count });

export type Batch = z.infer<typeof batchSchema>;
export type BatchState = Batch["estado"];
export type BatchRow = z.infer<typeof batchRowSchema>;
export type BatchRowsPage = z.infer<typeof batchRowsPageSchema>;
export type BatchHistory = z.infer<typeof batchHistorySchema>;
