import type { JSX, ReactNode } from "react";

import { FilaHeader } from "@/features/panel-fila/components/fila-header";
import { PlanBanner } from "@/features/panel-shell/components/plan-banner";
import type { Contagens, Plano } from "@/lib/api/schemas/panel/me";
import { cn } from "@/lib/utils";

type Props = {
  contagens: Contagens | undefined;
  plano: Plano | undefined;
  contratarHref: string | undefined;
  list: ReactNode;
  detail: ReactNode;
  /** /fila/{id}: below lg the detail is the one pane; on /fila, the list. */
  caseOpen: boolean;
  /** False when the open case's detail failed: it has no h1 of its own. */
  caseHeading?: boolean;
};

/**
 * The Fila (spec S6): the header, the plan banner (S5, also on a case: Q10),
 * then two panes at lg and up (list ≈ 2/5, detail ≈ 3/5) and one below,
 * chosen by the route.
 */
export function FilaScreen({
  contagens,
  plano,
  contratarHref,
  list,
  detail,
  caseOpen,
  caseHeading,
}: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      <FilaHeader
        contagens={contagens}
        caseOpen={caseOpen}
        caseHeading={caseHeading}
      />
      <PlanBanner plano={plano} contratarHref={contratarHref} />
      <div className="grid items-start gap-6 lg:grid-cols-[2fr_3fr]">
        <section
          data-pane="list"
          className={cn(
            "flex min-w-0 flex-col gap-4",
            caseOpen && "max-lg:hidden",
          )}
        >
          {list}
        </section>
        <section
          data-pane="detail"
          className={cn("min-w-0", !caseOpen && "max-lg:hidden")}
        >
          {detail}
        </section>
      </div>
    </div>
  );
}
