import { z } from "zod";

import { env } from "@/lib/env";
import {
  CASE_ESTADOS,
  CASE_EVENT_TIPOS,
  CASE_ORIGENS,
  CASE_STATUSES,
  CHECK_CHAVES,
  DECISAO_TIPOS,
  DOCUMENTO_TIPOS,
  MOTIVO_CODIGOS,
  VEREDITOS,
  isPanelId,
  parseLinkVendedor,
} from "@/lib/panel-api-values";
import { isLoopbackHostname } from "@/lib/safe-url";

// M6 cases, D-C1–D-C5 + C-M6-1/2/5/6 (Pre-Contract). Unknown enum values,
// ids or CNPJs fail the parse (INVALID_RESPONSE), never render. Objects
// strip fields they don't know (F11: a future vendedor_email never reaches
// the page). Backend text (motivos, check titles and values) is data.

const panelId = z.string().refine(isPanelId);
const count = z.number().int().nonnegative();
const cnpj = z.string().regex(/^[0-9A-Z]{12}[0-9]{2}$/); // A-X5
/** ISO 8601 with an offset or Z (A-X5). */
const isoDateTime = z.iso.datetime({ offset: true });
const text = (max: number) => z.string().max(max);
const nota = z.string().max(280);

/**
 * A signed document URL (D-C6): https only. The documents-origin allowlist
 * is the route handler's (T102, F2). http: on a loopback host only with
 * API_ALLOW_LOOPBACK_HTTP (the local mock, Q1).
 */
function isDocumentUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== "" || url.password !== "") return false;
  if (url.protocol === "https:") return true;
  return (
    url.protocol === "http:" &&
    env.API_ALLOW_LOOPBACK_HTTP === "true" &&
    isLoopbackHostname(url.hostname)
  );
}

/** F8: a link that isn't the seller's case link on LINK_HOST is dropped. */
const linkVendedor = z
  .string()
  .transform((value) =>
    env.LINK_HOST === undefined
      ? undefined
      : (parseLinkVendedor(value, env.LINK_HOST) ?? undefined),
  )
  .optional();

/** D-C1 item. */
export const caseSummarySchema = z.object({
  id: panelId,
  razao_social: text(300).nullable(),
  cnpj,
  veredito: z.enum(VEREDITOS),
  status: z.enum(CASE_STATUSES),
  motivos: z.array(text(300)).max(50),
  origem: z.enum(CASE_ORIGENS),
  sla_ate: isoDateTime,
  vencido: z.boolean(),
  criado_em: isoDateTime,
});

/** D-C1 page (A-X6 + C-M6-1 gerado_em, C-M6-2 limit ≤ 200). */
export const caseListSchema = z.object({
  itens: z.array(caseSummarySchema).max(200),
  proximo_cursor: z.string().max(512).nullable(),
  total: count,
  gerado_em: isoDateTime,
});

/** C-M6-1: `GET /cases?estado=aberto&desde=`. */
export const newCasesSchema = z.object({ novos: count });

/** C-M6-5: the history, a closed set of event types. */
export const caseEventSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("caso_criado"),
    em: isoDateTime,
    dados: z.object({ origem: z.enum(CASE_ORIGENS) }),
  }),
  z.object({
    tipo: z.literal("documento_pedido"),
    em: isoDateTime,
    dados: z.object({ tipos: z.array(z.enum(DOCUMENTO_TIPOS)).min(1).max(5) }),
  }),
  z.object({
    tipo: z.literal("documento_recebido"),
    em: isoDateTime,
    dados: z.object({ tipo: z.enum(DOCUMENTO_TIPOS) }),
  }),
  z.object({
    tipo: z.literal("decidido"),
    em: isoDateTime,
    dados: z.object({ decisao: z.enum(DECISAO_TIPOS) }),
  }),
  z.object({
    tipo: z.literal("reverificado"),
    em: isoDateTime,
    dados: z.object({}).optional(),
  }),
]);
// The schema and the closed set name the same types.
CASE_EVENT_TIPOS satisfies readonly z.infer<typeof caseEventSchema>["tipo"][];

/** C-M6-5: a seller document, with its short-lived signed URL (server only, F1). */
export const caseDocumentSchema = z.object({
  id: panelId,
  tipo: z.enum(DOCUMENTO_TIPOS),
  enviado_em: isoDateTime,
  url: z.string().max(2048).refine(isDocumentUrl),
});

const decisaoSchema = z.object({
  tipo: z.enum(DECISAO_TIPOS),
  em: isoDateTime,
  motivo_codigo: z.enum(MOTIVO_CODIGOS).optional(),
  nota_vendedor: nota.optional(),
});

/** D-C2's verification; the seller detail (D-S2, C-M8-3) reuses it. */
export const verificationSchema = z.object({
  id: panelId,
  modo: z.enum(["cache", "tempo_real"]),
  checagens: z
    .array(
      z.object({
        chave: z.enum(CHECK_CHAVES),
        titulo: text(200),
        descricao: text(1000),
        valor: text(500),
        status: z.enum(CASE_STATUSES),
      }),
    )
    .max(CHECK_CHAVES.length),
  criado_em: isoDateTime,
});

/** D-C2 (+ C-M6-5, C-M6-6). */
export const caseSchema = caseSummarySchema
  .extend({
    seller: z.object({
      id: panelId,
      razao_social: text(300).nullable(),
      cnpj,
    }),
    verification: verificationSchema,
    estado: z.enum(CASE_ESTADOS),
    consultado_em: isoDateTime.optional(),
    mudanca: z
      .object({
        tipo: text(64),
        campo: text(200),
        de: text(500),
        para: text(500),
        detectado_em: isoDateTime,
      })
      .optional(),
    responsavel_informado: text(300).optional(),
    ext_id: text(300).optional(),
    vendedor_tem_email: z.boolean(),
    variante: z.literal("DADOS_NAO_ENCONTRADOS").optional(),
    decisao: decisaoSchema.optional(),
    link_vendedor: linkVendedor,
    // Either may fail alone (D-C2): a malformed list reads as missing, and
    // the detail shows fila.detail.partial instead of failing the case.
    eventos: z.array(caseEventSchema).max(200).optional().catch(undefined),
    documentos: z.array(caseDocumentSchema).max(50).optional().catch(undefined),
  })
  .refine(
    (value) =>
      value.decisao?.tipo !== "manter" || value.origem === "monitoramento",
    { message: "manter outside monitoramento" },
  );

/** D-C4 200. */
export const requestDocumentsResultSchema = z.object({
  case: caseSchema,
  link_vendedor: linkVendedor,
});

export type CaseSummary = z.infer<typeof caseSummarySchema>;
export type CaseList = z.infer<typeof caseListSchema>;
export type Case = z.infer<typeof caseSchema>;
export type CaseEvent = z.infer<typeof caseEventSchema>;
export type CaseDocument = z.infer<typeof caseDocumentSchema>;
export type Decisao = z.infer<typeof decisaoSchema>;
