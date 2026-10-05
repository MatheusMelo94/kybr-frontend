import type { JSX } from "react";

import { loteCopy } from "@/features/panel-lote/copy";
import { TEMPLATE_PATH } from "@/features/panel-lote/template";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";
import type { Plano } from "@/lib/api/schemas/panel/me";

type Props = {
  /** From /me; missing hides the remaining line (S5, AC 11). */
  plano: Plano | undefined;
};

const LINK =
  "inline-flex min-h-10 items-center self-start text-body font-strong text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11";

/** S7's side card: what a batch costs, what's left, and the template (AC 14). */
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
      {/* A file download: a plain <a> with download, not a client navigation. */}
      <a href={TEMPLATE_PATH} download className={LINK}>
        {loteCopy["lote.template"]}
      </a>
      <p className="text-secondary text-ink-muted">
        {loteCopy["lote.template.hint"]}
      </p>
    </section>
  );
}
