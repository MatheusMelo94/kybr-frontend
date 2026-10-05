import type { JSX } from "react";

import { Notice } from "@/components/panel/notice";
import { CONTRATAR_LINK } from "@/features/panel-shell/components/plan-block";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { planGate } from "@/features/panel-shell/plan-variant";
import type { Plano } from "@/lib/api/schemas/panel/me";

type Props = {
  plano: Plano | undefined;
  /** A mailto: from COMMERCIAL_CONTACT_EMAIL; unset hides "Contratar" (P-U4). */
  contratarHref: string | undefined;
};

/**
 * The plan banner (AC 12) under a screen's heading when checks are used up or
 * none are granted: a warning Notice (a warn bar, ink text, DDR-0003), read in
 * place: no live region, no focus move, not dismissable. /fila renders it;
 * /lote reuses it (T79).
 */
export function PlanBanner({ plano, contratarHref }: Props): JSX.Element | null {
  const gate = planGate(plano);
  if (gate === undefined) return null;
  const contratar = contratarHref !== undefined;

  return (
    <Notice role="none" tone="warning" className="flex flex-col gap-1">
      <p>{shellCopy[gate === "none" ? "plan.none" : "plan.exhausted"]}</p>
      {gate === "none" && contratar && <p>{shellCopy["plan.none.cta_hint"]}</p>}
      {contratar && (
        <p>
          <a href={contratarHref} className={CONTRATAR_LINK}>
            {shellCopy["plan.trial.cta"]}
          </a>
        </p>
      )}
    </Notice>
  );
}
