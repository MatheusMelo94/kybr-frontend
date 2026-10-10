import type { JSX } from "react";

import { filaCopy } from "@/features/panel-fila/copy";
import type { CaseOrigem } from "@/lib/panel-api-values";

const LABELS: Record<CaseOrigem, string> = {
  link: filaCopy["fila.origin.link"],
  lote: filaCopy["fila.origin.lote"],
  monitoramento: filaCopy["fila.origin.alerta"],
};

/** Where the case came from: a neutral chip with its word (spec S6). */
export function OriginChip({ origem }: { origem: CaseOrigem }): JSX.Element {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-2 text-label text-ink-muted">
      {LABELS[origem]}
    </span>
  );
}
