import Link from "next/link";
import type { JSX } from "react";

import { loteCopy } from "@/features/panel-lote/copy";
import { fill, formatDate, formatNumber } from "@/features/panel-shell/format";
import type { BatchHistory } from "@/lib/api/schemas/panel/batches";

type Props = {
  /** D-B6, newest first; undefined when the read failed (partial error). */
  history: BatchHistory | undefined;
};

const LINK =
  "inline-flex min-h-10 flex-wrap items-center gap-x-2 rounded-md text-body text-ink underline underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11";

/** "Lotes anteriores" (S7): hidden when empty; a failed read is inline, the page still works. */
export function HistoryList({ history }: Props): JSX.Element | null {
  if (history !== undefined && history.length === 0) return null;
  return (
    <section aria-labelledby="lote-history-h" className="flex flex-col gap-2">
      <h2 id="lote-history-h" className="text-h2 font-title text-ink">
        {loteCopy["lote.history.h"]}
      </h2>
      {history === undefined ? (
        <p className="text-body text-ink-muted">
          {loteCopy["lote.history.error"]}
        </p>
      ) : (
        <ul className="flex flex-col">
          {history.map((batch) => (
            <li key={batch.id}>
              <Link href={`/lote/${batch.id}`} prefetch={false} className={LINK}>
                <span className="tabular-nums">
                  {fill(loteCopy["lote.history.row"], {
                    data: formatDate(batch.iniciado_em),
                    total: formatNumber(batch.total),
                  })}
                </span>
                {batch.estado === "processando" && (
                  <>
                    {" "}
                    <span className="text-secondary text-ink-muted">
                      {loteCopy["lote.history.running"]}
                    </span>
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
