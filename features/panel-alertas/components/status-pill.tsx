import type { JSX } from "react";

import { StatusPill } from "@/components/ui/status-pill";
import { alertasCopy } from "@/features/panel-alertas/copy";
import { formatProximaVarredura } from "@/features/panel-alertas/format";
import { fill } from "@/features/panel-shell/format";

/**
 * mon.status.on (AC 48): the neutral StatusPill with the --color-monitor
 * dot and ink text, the product's only blue (DDR-0003).
 */
export function MonStatusPill({
  proximaVarredura,
}: {
  proximaVarredura: string;
}): JSX.Element {
  return (
    <StatusPill tone="monitor">
      {fill(
        alertasCopy["mon.status.on"],
        formatProximaVarredura(proximaVarredura),
      )}
    </StatusPill>
  );
}
