import type { JSX } from "react";

import { StatusDot } from "@/components/ui/status-dot";
import { filaCopy } from "@/features/panel-fila/copy";
import { fill } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";
import type { Contagens } from "@/lib/api/schemas/panel/me";
import { cn } from "@/lib/utils";

type Props = {
  /** /me's counts; missing → no pills (spec S5, AC 11). */
  contagens: Contagens | undefined;
  /** On /fila/{id} below lg the case's name is the h1: this one is sr-only. */
  caseOpen?: boolean;
};

const PILL =
  "inline-flex items-center gap-2 rounded-full bg-field px-3 py-1 text-secondary font-strong text-ink tabular-nums";

/** fila.h1, fila.lead and the open / late pills (spec S6). */
export function FilaHeader({
  contagens,
  caseOpen = false,
}: Props): JSX.Element {
  const abertos = contagens?.fila_abertos;
  const vencidos = contagens?.fila_vencidos ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <div
        data-fila-title
        className={cn("flex flex-col gap-2", caseOpen && "max-lg:sr-only")}
      >
        <h1 className="text-title font-title text-ink">
          {filaCopy["fila.h1"]}
        </h1>
        <p className="text-lead font-lead text-ink-muted">
          {filaCopy["fila.lead"]}
        </p>
      </div>
      {abertos !== undefined && (
        <div className="flex flex-wrap gap-2">
          <span data-pill className={PILL}>
            {fill(plural(filaCopy, "fila.pill.open", abertos), { n: abertos })}
          </span>
          {vencidos > 0 && (
            // DDR-0003: the bad dot beside ink text, never red text.
            <span data-pill className={PILL}>
              <StatusDot tone="danger" />
              {fill(plural(filaCopy, "fila.pill.late", vencidos), {
                n: vencidos,
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
