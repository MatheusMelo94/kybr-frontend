import type { JSX } from "react";

import { StatusDot, type StatusTone } from "@/components/ui/status-dot";
import { filaCopy } from "@/features/panel-fila/copy";
import { fill } from "@/features/panel-shell/format";
import type { CaseView } from "@/lib/api/panel/cases";
import type { CaseStatus } from "@/lib/panel-api-values";

const TONES: Record<CaseStatus, StatusTone> = {
  ok: "success",
  warn: "warning",
  bad: "danger",
};

type Props = { checagens: CaseView["verification"]["checagens"] };

/**
 * fila.counts in a canvas-soft pill (identity.md § VerdictHeader): read as
 * one sentence (sr-only), shown as three dot + number + word items, cut
 * from the same filled string so the copy stays verbatim.
 */
export function CountsPill({ checagens }: Props): JSX.Element {
  const n = (status: CaseStatus) =>
    checagens.filter((check) => check.status === status).length;
  const sentence = fill(filaCopy["fila.counts"], {
    ok: n("ok"),
    warn: n("warn"),
    bad: n("bad"),
  });
  const parts = sentence.split(", ");
  const statuses: CaseStatus[] = ["ok", "warn", "bad"];
  return (
    <p className="self-start rounded-full bg-surface-raised px-3 py-1 text-secondary text-ink tabular-nums">
      <span className="sr-only">{sentence}</span>
      <span aria-hidden="true" data-counts className="flex flex-wrap gap-x-3">
        {statuses.map((status, i) => (
          <span
            key={status}
            data-count
            className="inline-flex items-center gap-1"
          >
            <StatusDot tone={TONES[status]} />
            {parts[i]}
          </span>
        ))}
      </span>
    </p>
  );
}
