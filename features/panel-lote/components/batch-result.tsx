import type { JSX } from "react";

import { BatchDonut } from "@/features/panel-lote/components/batch-donut";
import { BatchLegend } from "@/features/panel-lote/components/batch-legend";
import { ResultHeading } from "@/features/panel-lote/components/result-heading";
import { loteCopy } from "@/features/panel-lote/copy";
import {
  fill,
  formatDuration,
  formatNumber,
} from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";
import type { Batch } from "@/lib/api/schemas/panel/batches";

/**
 * S7 success / partial (AC 20, 21): the heading, the summary, the donut and
 * its legend, and the errors line when some rows weren't checked. QA Q4: the
 * summary's {total} is the rows actually consulted (total − erro).
 */
export function BatchResult({ batch }: { batch: Batch }): JSX.Element {
  const consulted = batch.total - batch.contagens.erro;
  const duration =
    batch.concluido_em === undefined
      ? 0
      : Date.parse(batch.concluido_em) - Date.parse(batch.iniciado_em);
  const summary = fill(loteCopy["lote.result.summary"], {
    total: formatNumber(consulted),
    duracao: formatDuration(duration),
  });
  const { erro } = batch.contagens;

  return (
    <div className="flex flex-col gap-4">
      <ResultHeading summary={summary} />
      <p className="text-body text-ink tabular-nums">{summary}</p>
      <div className="flex flex-wrap items-center gap-6">
        <BatchDonut contagens={batch.contagens} />
        <div className="min-w-48 flex-1">
          <BatchLegend contagens={batch.contagens} />
        </div>
      </div>
      {erro > 0 && (
        <p className="text-body text-ink tabular-nums">
          {fill(plural(loteCopy, "lote.result.errors", erro), {
            n: formatNumber(erro),
          })}
        </p>
      )}
    </div>
  );
}
