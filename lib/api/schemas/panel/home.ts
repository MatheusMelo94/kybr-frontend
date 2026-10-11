import { z } from "zod";

import { alertSchema } from "@/lib/api/schemas/panel/alerts";
import { caseSummarySchema } from "@/lib/api/schemas/panel/cases";

// D-H1 GET /v1/dashboard (C-M8-1, Pre-Contract). Every card is optional: the
// backend omits the ones it failed to compute and the page shows that card's
// error alone (plan-m8 D2). A card that is present must be well-formed, and
// an unknown field fails the parse.

const count = z.number().int().nonnegative();
/** An America/Sao_Paulo calendar day. */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const dashboardSchema = z.strictObject({
  kpis: z
    .strictObject({
      verificados: count,
      auto: count,
      revisao: count,
      bloqueados: count,
    })
    .optional(),
  /** The oldest open cases (D-C1 shape). */
  fila: z.array(caseSummarySchema).max(4).optional(),
  /** The newest alerts (D-M1 shape). */
  alertas: z.array(alertSchema).max(4).optional(),
  /** Seven days, oldest first. */
  semana: z
    .array(z.strictObject({ dia: day, total: count }))
    .length(7)
    .optional(),
  primeiros_passos: z
    .strictObject({
      lote: z.boolean(),
      link: z.boolean(),
      monitor: z.boolean(),
      oculto: z.boolean(),
    })
    .optional(),
});

export type Dashboard = z.infer<typeof dashboardSchema>;
