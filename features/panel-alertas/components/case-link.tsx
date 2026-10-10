import type { JSX } from "react";

import { OfflineAwareLink } from "@/features/panel-alertas/components/offline-aware-link";
import { alertasCopy } from "@/features/panel-alertas/copy";
import { filaCopy } from "@/features/panel-fila/copy";
import { fill } from "@/features/panel-shell/format";
import type { Alert } from "@/lib/api/schemas/panel/alerts";

/** "Decidir": the secondary control's look, ≥ 44 × 44 on coarse pointers (AC 51). */
export const DECIDIR_CLASS =
  "inline-flex min-h-(--size-control-panel) min-w-11 items-center justify-center rounded-full border border-field-line px-4 text-body font-strong text-ink " +
  "transition-colors duration-(--duration-fast) ease-out-quart motion-reduce:transition-none hover:bg-surface-raised " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11 " +
  "aria-disabled:cursor-not-allowed aria-disabled:text-ink-muted aria-disabled:hover:bg-transparent";

/**
 * The row's case action (AC 48): an open case → alert.case.open to
 * /fila/{case_id} (the M6 detail); a decided one → alert.case.decided with
 * the Fila's decision word (G2); no case (atenção / info, WEBHOOK_FALHOU,
 * AC 52) → nothing. Offline the link is aria-disabled (G6); the page's
 * first one carries offline.actions (`note`).
 */
export function CaseLink({
  alert,
  note = false,
}: {
  alert: Alert;
  note?: boolean;
}): JSX.Element | null {
  if (alert.case_id === undefined) return null;
  if (alert.case_decisao !== undefined)
    return (
      <span className="text-secondary font-strong text-ink">
        {fill(alertasCopy["alert.case.decided"], {
          decisao: filaCopy[`fila.decision.${alert.case_decisao}`],
        })}
      </span>
    );
  return (
    <OfflineAwareLink
      href={`/fila/${encodeURIComponent(alert.case_id)}`}
      className={DECIDIR_CLASS}
      note={note}
      describedBy={`alerta-${alert.id}`}
    >
      {alertasCopy["alert.case.open"]}
    </OfflineAwareLink>
  );
}
