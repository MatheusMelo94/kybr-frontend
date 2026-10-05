import type { JSX } from "react";

import { loteCopy } from "@/features/panel-lote/copy";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";
import type { Batch } from "@/lib/api/schemas/panel/batches";

type Props = { batch: Batch };

/**
 * /lote/[batchId]'s body per estado, from the server's read: the progress
 * (T81 makes it live), the result (T82–T84, T86) and the stopped batch (T85).
 */
export function BatchState({ batch }: Props): JSX.Element {
  const total = formatNumber(batch.total);
  if (batch.estado === "processando")
    return (
      <section aria-labelledby="lote-state-h" className="flex flex-col gap-2">
        <h2 id="lote-state-h" className="text-h2 font-title text-ink">
          {fill(loteCopy["lote.progress.h"], { total })}
        </h2>
        <p className="text-body text-ink tabular-nums">
          {fill(loteCopy["lote.progress.count"], {
            processados: formatNumber(batch.processados),
            total,
          })}
        </p>
        <p className="text-secondary text-ink-muted">
          {loteCopy["lote.progress.leave"]}
        </p>
      </section>
    );
  if (batch.estado === "falhou")
    return (
      <section aria-labelledby="lote-state-h" className="flex flex-col gap-2">
        <h2 id="lote-state-h" className="text-h2 font-title text-ink">
          {loteCopy["lote.failed.h"]}
        </h2>
        <p className="text-body text-ink tabular-nums">
          {fill(loteCopy["lote.failed.body"], {
            processados: formatNumber(batch.processados),
            total,
          })}
        </p>
      </section>
    );
  const { erro } = batch.contagens;
  return (
    <section aria-labelledby="lote-state-h" className="flex flex-col gap-2">
      <h2 id="lote-state-h" className="text-h2 font-title text-ink">
        {loteCopy["lote.result.h"]}
      </h2>
      {erro > 0 && (
        <p className="text-body text-ink tabular-nums">
          {fill(plural(loteCopy, "lote.result.errors", erro), {
            n: formatNumber(erro),
          })}
        </p>
      )}
    </section>
  );
}
