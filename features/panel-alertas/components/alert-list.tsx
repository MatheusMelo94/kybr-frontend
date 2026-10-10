import type { JSX, ReactNode } from "react";

import { AlertRow } from "@/features/panel-alertas/components/alert-row";
import { alertasCopy } from "@/features/panel-alertas/copy";
import type { AlertList as Alerts } from "@/lib/api/schemas/panel/alerts";

type Props = {
  /** Newest first, as the API orders them (C-M7-5). */
  alerts: Alerts;
  /** The render's clock, for the relative dates. */
  now: Date;
  /** What shows instead of the list when there are no alerts (MonEmpty, AC 49). */
  empty?: ReactNode;
};

/** mon.alerts.h, mon.alerts.sub and the alerts (S8 success, AC 48). */
export function AlertList({ alerts, now, empty }: Props): JSX.Element {
  return (
    <section aria-labelledby="mon-alerts-h" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="mon-alerts-h" className="text-h2 font-title text-ink">
          {alertasCopy["mon.alerts.h"]}
        </h2>
        <p className="text-body text-ink-muted">
          {alertasCopy["mon.alerts.sub"]}
        </p>
      </div>
      {alerts.length === 0 ? (
        empty
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <li key={alert.id} className="min-w-0">
              <AlertRow alert={alert} now={now} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
