import type { JSX } from "react";

import { PlanBanner } from "@/features/panel-shell/components/plan-banner";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import type { Plano } from "@/lib/api/schemas/panel/me";

type Props = {
  plano: Plano | undefined;
  contratarHref: string | undefined;
};

/**
 * The M4 Fila: its title and lead only (plan § 3.2, P-U2: unreleased), and the
 * plan banner under them when checks are used up or none granted (AC 12).
 * REPLACED IN M6 by the real Fila (list + case detail), which keeps the banner.
 */
export function FilaStub({ plano, contratarHref }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-title text-ink">{shellCopy["fila.h1"]}</h1>
        <p className="text-lead font-lead text-ink-muted">
          {shellCopy["fila.lead"]}
        </p>
      </div>
      <PlanBanner plano={plano} contratarHref={contratarHref} />
    </div>
  );
}
