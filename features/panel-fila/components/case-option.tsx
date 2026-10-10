import type { JSX } from "react";

import { OriginChip } from "@/features/panel-fila/components/origin-chip";
import { SlaText } from "@/features/panel-fila/components/sla-text";
import { StatusWord } from "@/features/panel-lote/components/status-word";
import type { CaseOrigem, CaseStatus } from "@/lib/panel-api-values";
import { cn } from "@/lib/utils";

type Props = {
  status: CaseStatus;
  /** The razão social, or the masked CNPJ when it's null (G3). */
  razao: string;
  motivos: readonly string[];
  origem: CaseOrigem;
  slaAte: string;
  vencido: boolean;
  /** The list's gerado_em (C-M6-1). */
  now: string;
};

/**
 * One case in the list (spec S6, AC 27): the status word (G12), the name,
 * the reasons, the origin chip and the SLA, at least the skeleton's height (no
 * shift). Backend text is rendered as text only.
 */
export function CaseOption({
  status,
  razao,
  motivos,
  origem,
  slaAte,
  vencido,
  now,
}: Props): JSX.Element {
  return (
    <div
      className={cn(
        // The skeleton's h-19 as a minimum: no shift, and 200 % text grows it.
        "min-h-19",
        // DOM order = reading order (plan § 8, P6-011): status, razão social,
        // reasons, origin, SLA. The flex order draws the status, origin and
        // SLA on the first line (it wraps), then the name, then the reasons.
        "flex min-w-0 flex-wrap content-center items-center gap-x-2 gap-y-1 border-b border-line px-3",
        // The open case: an ink bar, not a fill (danger ink keeps its
        // contrast in both themes, AC 69).
        "border-l-4 border-l-transparent hover:border-l-line in-aria-selected:border-l-ink",
      )}
    >
      <span className="order-1 text-secondary">
        <StatusWord status={status} />
      </span>
      <p className="order-4 min-w-0 basis-full truncate text-body font-strong text-ink tabular-nums">
        {razao}
      </p>
      <p className="order-5 min-w-0 basis-full truncate text-secondary text-ink-muted">
        {motivos.join(", ")}
      </p>
      <span className="order-2 text-secondary">
        <OriginChip origem={origem} />
      </span>
      <span className="order-3 ml-auto shrink-0 text-secondary">
        <SlaText slaAte={slaAte} vencido={vencido} now={now} />
      </span>
    </div>
  );
}
