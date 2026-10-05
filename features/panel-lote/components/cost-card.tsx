import type { JSX } from "react";

import { loteCopy } from "@/features/panel-lote/copy";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";
import type { Plano } from "@/lib/api/schemas/panel/me";

type Props = {
  /** From /me; missing hides the remaining line (S5, AC 11). */
  plano: Plano | undefined;
};

/** S7's side card: what a batch costs and what's left (AC 14). */
export function CostCard({ plano }: Props): JSX.Element {
  const left =
    plano === undefined ? undefined : Math.max(0, plano.limite - plano.usadas);
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-line p-4">
      <p className="text-body text-ink">{loteCopy["lote.cost.line"]}</p>
      {left !== undefined && (
        <p className="text-body text-ink tabular-nums">
          {fill(plural(loteCopy, "lote.cost.remaining", left), {
            n: formatNumber(left),
          })}
        </p>
      )}
    </section>
  );
}
