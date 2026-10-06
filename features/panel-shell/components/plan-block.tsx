import type { JSX } from "react";

import { StatusDot } from "@/components/ui/status-dot";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill, formatDate, formatNumber } from "@/features/panel-shell/format";
import { planGate } from "@/features/panel-shell/plan-variant";
import { planTitle } from "@/features/panel-shell/plan-title";
import type { Plano } from "@/lib/api/schemas/panel/me";

type Props = {
  plano: Plano | undefined;
  /** A mailto: built on the server from COMMERCIAL_CONTACT_EMAIL; unset hides "Contratar" (P-U4). */
  contratarHref: string | undefined;
};

export const CONTRATAR_LINK =
  "inline-flex min-h-6 items-center text-secondary font-strong text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11";

type SummaryProps = {
  plano: Plano;
  /** plan.none.cta_hint only makes sense beside a "Contratar". */
  contratar: boolean;
};

/** The plan's text (spec S5): its title, then usage and cycle, or used up, or none granted. */
export function PlanSummary({ plano, contratar }: SummaryProps): JSX.Element {
  const gate = planGate(plano);
  return (
    <>
      <p className="text-secondary font-strong text-ink">{planTitle(plano)}</p>
      {gate === "none" ? (
        <>
          <p className="text-secondary text-ink-muted">
            {shellCopy["plan.none"]}
          </p>
          {contratar && (
            <p className="text-secondary text-ink-muted">
              {shellCopy["plan.none.cta_hint"]}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-secondary text-ink-muted tabular-nums">
            {fill(
              shellCopy[
                plano.tipo === "pago" ? "plan.paid.usage" : "plan.trial.usage"
              ],
              {
                usadas: formatNumber(plano.usadas),
                limite: formatNumber(plano.limite),
              },
            )}
          </p>
          {plano.tipo === "pago" && plano.ciclo_ate !== undefined && (
            <p className="text-secondary text-ink-muted">
              {fill(shellCopy["plan.paid.cycle"], {
                data: formatDate(plano.ciclo_ate),
              })}
            </p>
          )}
          {gate === "exhausted" && (
            // DDR-0003: ink text with a warning dot, never amber text.
            <p className="flex items-baseline gap-2 text-secondary text-ink">
              <StatusDot tone="warning" />
              {shellCopy["plan.exhausted"]}
            </p>
          )}
        </>
      )}
    </>
  );
}

/** The plan block (spec S5, AC 12): trial, paid, used up, none granted; hidden when /me lacks it. */
export function PlanBlock({ plano, contratarHref }: Props): JSX.Element | null {
  if (plano === undefined) return null;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line p-3">
      <PlanSummary plano={plano} contratar={contratarHref !== undefined} />
      {contratarHref !== undefined && (
        <a href={contratarHref} className={CONTRATAR_LINK}>
          {shellCopy["plan.trial.cta"]}
        </a>
      )}
    </div>
  );
}
