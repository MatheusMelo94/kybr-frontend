"use client";

import { useEffect, useState, type JSX } from "react";

import { Button } from "@/components/ui/button";
import {
  resumeBatchAction,
  type ResumeResult,
} from "@/features/panel-lote/actions";
import { BatchLegend } from "@/features/panel-lote/components/batch-legend";
import { useBatchFocus } from "@/features/panel-lote/components/batch-focus-keeper";
import { loteCopy } from "@/features/panel-lote/copy";
import { CONTRATAR_LINK } from "@/features/panel-shell/components/plan-block";
import { shellCopy } from "@/features/panel-shell/copy/shell";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";
import { useRefreshUntilReplaced } from "@/lib/navigation/refresh-until";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";
import type { Batch } from "@/lib/api/schemas/panel/batches";

type Props = {
  batch: Batch;
  /** A mailto: from COMMERCIAL_CONTACT_EMAIL; unset hides "Contratar" (P-U4). */
  contratarHref: string | undefined;
};

/**
 * S7 "the batch stopped" (AC 22, J3.5.2): what was done, the legend for it,
 * and "Verificar os que faltam". Announced as an alert only when the poll
 * saw it stop (not on a cold load). A resume blocked by the allowance shows
 * plan.exhausted (plan D5) with "Contratar"; any other failure,
 * lote.action.error. Both are alerts; the button stays usable.
 */
export function BatchFailed({ batch, contratarHref }: Props): JSX.Element {
  const focus = useBatchFocus();
  const expire = useSessionExpiry();
  const { setLoteRunning } = useShellStatus();
  const refresh = useRefreshUntilReplaced();
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"allowance" | "failed" | null>(null);

  useEffect(() => {
    setLive(focus.endedLive());
    // Once, when the stopped batch replaces the progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onResume(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    let result: ResumeResult;
    try {
      result = await resumeBatchAction({ batchId: batch.id });
    } catch {
      result = { ok: false, code: "FAILED" };
    }
    setBusy(false);
    if (result.ok) {
      setLoteRunning(true);
      // The server renders the progress again; this view goes away.
      refresh();
      return;
    }
    if (result.code === "SESSAO_EXPIRADA") expire();
    else setProblem(result.code === "SEM_SALDO" ? "allowance" : "failed");
  }

  const heading = (
    <h2 className="text-h2 font-title text-ink">{loteCopy["lote.failed.h"]}</h2>
  );

  return (
    <section className="flex flex-col gap-4">
      {live ? <div role="alert">{heading}</div> : heading}
      <p className="text-body text-ink tabular-nums">
        {fill(loteCopy["lote.failed.body"], {
          processados: formatNumber(batch.processados),
          total: formatNumber(batch.total),
        })}
      </p>
      <BatchLegend contagens={batch.contagens} />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="panel" busy={busy} onClick={() => void onResume()}>
          {loteCopy["lote.failed.cta"]}
        </Button>
        {problem === "allowance" && (
          <div role="alert" className="flex flex-col gap-1">
            <p className="text-secondary text-ink">
              {shellCopy["plan.exhausted"]}
            </p>
            {contratarHref !== undefined && (
              <a href={contratarHref} className={CONTRATAR_LINK}>
                {shellCopy["plan.trial.cta"]}
              </a>
            )}
          </div>
        )}
        {problem === "failed" && (
          <p role="alert" className="text-secondary text-danger-ink">
            {loteCopy["lote.action.error"]}
          </p>
        )}
      </div>
    </section>
  );
}
