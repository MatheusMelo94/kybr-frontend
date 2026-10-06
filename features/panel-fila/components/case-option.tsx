import type { JSX } from "react";

import { LIST_ITEM_HEIGHT } from "@/features/panel-fila/components/list-skeleton";
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
 * the reasons, the origin chip and the SLA, at the skeleton's height (no
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
        LIST_ITEM_HEIGHT,
        "flex min-w-0 flex-col justify-center gap-1 border-b border-line px-3",
        "group-aria-disabled:opacity-60 hover:bg-surface-raised in-aria-selected:bg-field",
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-secondary">
        <StatusWord status={status} />
        <OriginChip origem={origem} />
        <span className="ml-auto shrink-0">
          <SlaText slaAte={slaAte} vencido={vencido} now={now} />
        </span>
      </div>
      <p className="truncate text-body font-strong text-ink">{razao}</p>
      <p className="truncate text-secondary text-ink-muted">
        {motivos.join(", ")}
      </p>
    </div>
  );
}
