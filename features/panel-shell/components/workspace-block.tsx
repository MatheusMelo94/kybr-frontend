import type { JSX } from "react";

import { KybrSymbol } from "@/components/panel/symbol";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { planTitle } from "@/features/panel-shell/plan-title";
import type { Plano } from "@/lib/api/schemas/panel/me";

type Props = {
  nome: string;
  /** /me's plano. Missing (failed) or none granted (limite 0) hides the title line. */
  plano: Plano | undefined;
};

/**
 * The sidebar top (spec S5, AC 9; brand v1): the 32 px dotless Kybr symbol
 * (named, no visible "Kybr"), then the workspace name over the plan title.
 */
export function WorkspaceBlock({ nome, plano }: Props): JSX.Element {
  const title =
    plano !== undefined && plano.limite > 0 ? planTitle(plano) : undefined;
  return (
    <div className="flex items-center gap-3">
      <KybrSymbol size={32} aria-label={globalCopy.brand} />
      <div className="flex min-w-0 flex-col">
        <p className="text-body font-strong break-words text-ink">{nome}</p>
        {title !== undefined && (
          <p className="text-secondary text-ink-muted">{title}</p>
        )}
      </div>
    </div>
  );
}
