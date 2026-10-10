import type { JSX } from "react";

import { MonStatusPill } from "@/features/panel-alertas/components/status-pill";
import { alertasCopy } from "@/features/panel-alertas/copy";
import type { Monitoring } from "@/lib/api/schemas/panel/alerts";

type Props = {
  /** D-M2, or undefined when its read failed and alerts render anyway (G4: the pill hides silently). */
  monitoring: Monitoring | undefined;
};

/** mon.h1, mon.lead and, while monitoring runs, the status pill (S8). */
export function MonHeader({ monitoring }: Props): JSX.Element {
  const proxima =
    monitoring?.ativo === true && monitoring.monitorados > 0
      ? monitoring.proxima_varredura
      : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-title text-ink">
          {alertasCopy["mon.h1"]}
        </h1>
        <p className="text-lead font-lead text-ink-muted">
          {alertasCopy["mon.lead"]}
        </p>
      </div>
      {proxima !== undefined && (
        <div className="flex min-w-0 flex-wrap tabular-nums">
          <MonStatusPill proximaVarredura={proxima} />
        </div>
      )}
    </div>
  );
}
