import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import { fill, formatDuration } from "@/features/panel-shell/format";
import { cn } from "@/lib/utils";

type Props = {
  /** The case's sla_ate (ISO 8601). */
  slaAte: string;
  /** The API's own verdict on lateness (D-C1 `vencido`). */
  vencido: boolean;
  /** The page's clock: the list's gerado_em, the API's time (C-M6-1). */
  now: string;
};

/**
 * "Vence em 6 h" / "Atrasado há 2 dias" (spec S6). Late is the panel's one
 * red text outside forms: danger ink, and the words say it (G12, DDR-0003).
 */
export function SlaText({ slaAte, vencido, now }: Props): JSX.Element {
  const gap = Date.parse(slaAte) - Date.parse(now);
  const text = vencido
    ? fill(filaCopy["fila.sla.late"], { duracao: formatDuration(-gap) })
    : fill(filaCopy["fila.sla.due"], { duracao: formatDuration(gap) });
  return (
    <span
      className={cn(
        "text-secondary tabular-nums",
        vencido ? "text-danger-ink" : "text-ink-muted",
      )}
    >
      {text}
    </span>
  );
}
