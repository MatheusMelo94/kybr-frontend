import type { JSX } from "react";

import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { loteCopy } from "@/features/panel-lote/copy";
import type { BatchRowStatus } from "@/lib/panel-api-values";

/** The legend's word and dot for each row status (shared by the legend and the table). */
export const STATUS_WORDS: Record<
  BatchRowStatus,
  { word: string; tone: StatusTone }
> = {
  ok: { word: loteCopy["lote.legend.ok"], tone: "success" },
  warn: { word: loteCopy["lote.legend.warn"], tone: "warning" },
  bad: { word: loteCopy["lote.legend.bad"], tone: "danger" },
  erro: { word: loteCopy["lote.legend.err"], tone: "neutral" },
};

/** A status as a dot (decorative) + its word in ink (DDR-0003). */
export function StatusWord({
  status,
}: {
  status: BatchRowStatus;
}): JSX.Element {
  const { word, tone } = STATUS_WORDS[status];
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <StatusDot tone={tone} />
      {word}
    </span>
  );
}
