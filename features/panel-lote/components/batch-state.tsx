import type { JSX } from "react";

import { BatchFailed } from "@/features/panel-lote/components/batch-failed";
import { BatchProgress } from "@/features/panel-lote/components/batch-progress";
import { BatchResult } from "@/features/panel-lote/components/batch-result";
import { ShellCatchUp } from "@/features/panel-lote/components/shell-catch-up";
import type { Batch } from "@/lib/api/schemas/panel/batches";

type Props = {
  batch: Batch;
  /** For a stopped batch's allowance problem (T85). */
  contratarHref: string | undefined;
};

/**
 * /lote/[batchId]'s body per estado, from the server's read: the live
 * progress (T81), the result (T82–T84, T86) and the stopped batch (T85).
 * A settled batch also brings ShellCatchUp: the layout's /me may be older.
 * It's keyed by estado: a resume that settles inside its own action (the
 * stopped view's catch-up already spent) gets a fresh one for the result.
 */
export function BatchState({ batch, contratarHref }: Props): JSX.Element {
  if (batch.estado === "processando")
    return (
      <BatchProgress
        batchId={batch.id}
        initial={{ processados: batch.processados, total: batch.total }}
      />
    );
  return (
    <>
      <ShellCatchUp key={batch.estado} />
      {batch.estado === "falhou" ? (
        <BatchFailed batch={batch} contratarHref={contratarHref} />
      ) : (
        <BatchResult batch={batch} />
      )}
    </>
  );
}
