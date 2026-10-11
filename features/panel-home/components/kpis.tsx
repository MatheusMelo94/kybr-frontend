import type { JSX } from "react";

import { homeCopy } from "@/features/panel-home/copy";
import { formatNumber } from "@/features/panel-shell/format";
import type { Dashboard } from "@/lib/api/schemas/panel/home";

type Props = { kpis: NonNullable<Dashboard["kpis"]> };

const ITEMS = [
  ["verificados", "home.kpi.verified"],
  ["auto", "home.kpi.auto"],
  ["revisao", "home.kpi.review"],
  ["bloqueados", "home.kpi.blocked"],
] as const;

/** The four KPIs (S9), each a figure over its label; 0 shows as "0" (G10). */
export function Kpis({ kpis }: Props): JSX.Element {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {ITEMS.map(([field, key]) => (
        <div
          key={field}
          className="flex min-w-0 flex-col-reverse gap-1 rounded-lg border border-line p-4"
        >
          <dt className="text-secondary break-words text-ink-muted">
            {homeCopy[key]}
          </dt>
          <dd className="text-title font-title text-ink tabular-nums">
            {formatNumber(kpis[field])}
          </dd>
        </div>
      ))}
    </dl>
  );
}
