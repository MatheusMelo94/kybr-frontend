import type { JSX } from "react";

import { OfflineAwareLink } from "@/features/panel-alertas/components/offline-aware-link";
import { alertasCopy } from "@/features/panel-alertas/copy";
import type { MonState } from "@/features/panel-alertas/state";
import { PANEL_LINK } from "@/features/panel-shell/components/panel-not-found";
import { fill, formatDate } from "@/features/panel-shell/format";

type Props = {
  state: Extract<MonState, { kind: "unmonitored" | "nosweep" | "noalerts" }>;
};

/** The three empty states (AC 49): why it's empty, and the one action when there is one. */
export function MonEmpty({ state }: Props): JSX.Element {
  return (
    <div data-mon-empty className="flex flex-col gap-2">
      <p className="text-body text-ink tabular-nums">
        {state.kind === "unmonitored"
          ? alertasCopy["mon.empty.unmonitored"]
          : fill(alertasCopy[`mon.empty.${state.kind}`], {
              data: formatDate(state.data),
            })}
      </p>
      {state.kind === "unmonitored" && (
        <div className="flex flex-wrap gap-2">
          <OfflineAwareLink
            href="/lote"
            className={`${PANEL_LINK} aria-disabled:cursor-not-allowed aria-disabled:text-ink-muted`}
            note
          >
            {alertasCopy["mon.empty.unmonitored.cta"]}
          </OfflineAwareLink>
        </div>
      )}
    </div>
  );
}
