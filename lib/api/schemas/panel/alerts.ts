import { z } from "zod";

import {
  ALERT_SEVERIDADES,
  DECISAO_TIPOS,
  isPanelId,
} from "@/lib/panel-api-values";

// M7 alerts and sweep status, D-M1 + D-M2 + C-M7-1/2/3/5 (Pre-Contract).
// Each `tipo` carries exactly its copy key's placeholders in `dados`
// (C-M7-1): a missing, extra or off-enum value fails the whole parse
// (fail-closed, Security A-F4), never renders. Other objects strip fields
// they don't know (M6 F11). `responsavel` and `cnae` are backend text, kept
// to their caps (A-F2) and rendered as React text only.

const panelId = z.string().refine(isPanelId);
const cnpj = z.string().regex(/^[0-9A-Z]{12}[0-9]{2}$/); // A-X5
/** ISO 8601 with an offset or Z (A-X5). */
const isoDateTime = z.iso.datetime({ offset: true });

const REGIMES = [
  "MEI",
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
] as const;

const base = {
  id: panelId,
  severidade: z.enum(ALERT_SEVERIDADES),
  seller: z.object({
    id: panelId,
    razao_social: z.string().max(300).nullable(),
    cnpj,
  }),
  detectado_em: isoDateTime,
  case_id: panelId.optional(),
  case_decisao: z.enum(DECISAO_TIPOS).optional(),
  pedido_aberto: z.boolean().optional(),
};

const variant = <T extends string, D extends z.ZodRawShape>(
  tipo: T,
  dados: D,
) => z.object({ ...base, tipo: z.literal(tipo), dados: z.strictObject(dados) });

/** One D-M1 alert. */
export const alertSchema = z.discriminatedUnion("tipo", [
  variant("SITUACAO_IRREGULAR", {
    situacao: z.enum(["inapta", "baixada", "suspensa", "nula"]),
  }),
  variant("IE_SUSPENSA", {
    estado_ie: z.enum(["suspensa", "cancelada"]),
    uf: z.string().regex(/^[A-Z]{2}$/),
  }),
  variant("RESPONSAVEL_SAIU_QSA", { responsavel: z.string().min(1).max(120) }),
  variant("QSA_MUDOU", {}),
  variant("CNAE_MUDOU", { cnae: z.string().min(1).max(200) }),
  variant("REGIME_MUDOU", { de: z.enum(REGIMES), para: z.enum(REGIMES) }),
  // C-M7-1: a webhook failure never links a case.
  variant("WEBHOOK_FALHOU", {}).extend({
    case_id: z.undefined().optional(),
    case_decisao: z.undefined().optional(),
  }),
]);

/** D-M1 list: newest first, at most 50 (C-M7-5). */
export const alertListSchema = z.array(alertSchema).max(50);

/** D-M2 sweep status (C-M7-2). */
export const monitoringSchema = z
  .object({
    ativo: z.boolean(),
    monitorados: z.number().int().nonnegative(),
    ultima_varredura: isoDateTime.optional(),
    proxima_varredura: isoDateTime.optional(),
  })
  .refine((m) => m.monitorados === 0 || m.proxima_varredura !== undefined, {
    path: ["proxima_varredura"],
  });

export type Alert = z.infer<typeof alertSchema>;
export type AlertList = z.infer<typeof alertListSchema>;
export type Monitoring = z.infer<typeof monitoringSchema>;
