import type { JSX } from "react";

import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill, formatDate, formatNumber } from "@/features/panel-shell/format";
import type { Plano } from "@/lib/api/schemas/panel/me";

type Props = {
  plano: Plano | undefined;
  /** A mailto: built on the server from COMMERCIAL_CONTACT_EMAIL; unset hides "Contratar" (P-U4). */
  contratarHref: string | undefined;
};

const LINK =
  "inline-flex min-h-6 items-center text-secondary font-strong text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11";

/** The plan block (spec S5, AC 12): trial, paid, used up, none granted; hidden when /me lacks it. */
export function PlanBlock({ plano, contratarHref }: Props): JSX.Element | null {
  if (plano === undefined) return null;
  const usadas = formatNumber(plano.usadas);
  const limite = formatNumber(plano.limite);
  const none = plano.limite === 0;
  const exhausted = !none && plano.usadas >= plano.limite;
  const contratar = contratarHref !== undefined && (
    <a href={contratarHref} className={LINK}>
      {shellCopy["plan.trial.cta"]}
    </a>
  );

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line p-3">
      <p className="text-secondary font-strong text-ink">
        {plano.tipo === "pago" && plano.nome !== undefined
          ? fill(shellCopy["plan.paid.title"], { nome: plano.nome })
          : shellCopy["plan.trial.title"]}
      </p>
      {none ? (
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
              { usadas, limite },
            )}
          </p>
          {plano.tipo === "pago" && plano.ciclo_ate !== undefined && (
            <p className="text-secondary text-ink-muted">
              {fill(shellCopy["plan.paid.cycle"], {
                data: formatDate(plano.ciclo_ate),
              })}
            </p>
          )}
          {exhausted && (
            <p className="text-secondary text-warning-ink">
              {shellCopy["plan.exhausted"]}
            </p>
          )}
        </>
      )}
      {contratar}
    </div>
  );
}
