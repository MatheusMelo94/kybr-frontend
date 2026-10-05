import type { JSX } from "react";

import { BatchProgress } from "@/features/panel-lote/components/batch-progress";
import { BatchResult } from "@/features/panel-lote/components/batch-result";
import { loteCopy } from "@/features/panel-lote/copy";
import { fill, formatNumber } from "@/features/panel-shell/format";
import type { Batch } from "@/lib/api/schemas/panel/batches";

type Props = { batch: Batch };

/**
 * /lote/[batchId]'s body per estado, from the server's read: the live
 * progress (T81), the result (T82–T84, T86) and the stopped batch (T85).
 */
export function BatchState({ batch }: Props): JSX.Element {
  const total = formatNumber(batch.total);
  if (batch.estado === "processando")
    return (
      <BatchProgress
        batchId={batch.id}
        initial={{ processados: batch.processados, total: batch.total }}
      />
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
  return <BatchResult batch={batch} />;
}
