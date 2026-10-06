"use client";

import Link from "next/link";
import { useRef, useState, type JSX } from "react";

import { useToast } from "@/components/panel/toast";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import {
  monitorBatchAction,
  sendToQueueAction,
  type BatchWriteResult,
} from "@/features/panel-lote/actions";
import { loteCopy } from "@/features/panel-lote/copy";
import { fill, formatNumber } from "@/features/panel-shell/format";
import { plural } from "@/features/panel-shell/plural";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";
import type { Batch } from "@/lib/api/schemas/panel/batches";

type Props = {
  batchId: string;
  contagens: Batch["contagens"];
  enviadoParaFila: boolean;
  monitorado: boolean;
};

const LINK =
  "inline-flex min-h-(--size-control-panel) items-center rounded-full border border-field-line px-6 text-body font-strong text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus pointer-coarse:min-h-11";

type Kind = "queue" | "monitor";

/**
 * The result's actions (S7 Action results; AC 23, AC 24 panel half): to the
 * Fila (n = Atenção + Crítico; hidden at 0) and weekly monitoring (hidden
 * when no row succeeded). Each is busy, then a toast and its done state;
 * an error is inline next to it. One Idempotency-Key per button and batch,
 * reused on a retry (A-X7).
 */
export function BatchActions({
  batchId,
  contagens,
  enviadoParaFila,
  monitorado,
}: Props): JSX.Element | null {
  const toast = useToast();
  const expire = useSessionExpiry();
  const shell = useShellStatus();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [failed, setFailed] = useState<Kind | null>(null);
  const [queued, setQueued] = useState(enviadoParaFila);
  const [watching, setWatching] = useState(monitorado);
  const keys = useRef<Record<Kind, string> | null>(null);
  keys.current ??= { queue: crypto.randomUUID(), monitor: crypto.randomUUID() };

  const cases = contagens.warn + contagens.bad;
  const checked = contagens.ok + contagens.warn + contagens.bad;
  if (cases === 0 && checked === 0) return null;

  async function run(kind: Kind): Promise<void> {
    if (busy !== null || keys.current === null) return;
    setBusy(kind);
    setFailed(null);
    let result: BatchWriteResult;
    try {
      result = await (
        kind === "queue" ? sendToQueueAction : monitorBatchAction
      )({
        batchId,
        idempotencyKey: keys.current[kind],
      });
    } catch {
      result = { ok: false, code: "FAILED" };
    }
    setBusy(null);
    if (!result.ok) {
      if (result.code === "SESSAO_EXPIRADA") expire();
      else setFailed(kind);
      return;
    }
    const n = formatNumber(result.count);
    if (kind === "queue") {
      toast.show(
        fill(plural(loteCopy, "toast.batch_queued", result.count), { n }),
      );
      setQueued(true);
      // The shell's Fila count at once (the layout revalidation catches up
      // with the server's number on the next server render).
      if (shell.contagens !== undefined)
        shell.update({
          contagens: {
            ...shell.contagens,
            fila_abertos: shell.contagens.fila_abertos + result.count,
          },
          plano: shell.plano,
        });
    } else {
      toast.show(
        fill(plural(loteCopy, "toast.monitor_on", result.count), { n }),
      );
      setWatching(true);
    }
  }

  const error = (
    <p role="alert" className="text-secondary text-danger-ink">
      {loteCopy["lote.action.error"]}
    </p>
  );

  return (
    <div className="flex flex-col gap-3">
      {cases > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {queued ? (
            <Link href="/fila" className={LINK}>
              {loteCopy["lote.toqueue.done"]}
            </Link>
          ) : (
            <Button
              size="panel"
              className="tabular-nums"
              busy={busy === "queue"}
              onClick={() => void run("queue")}
            >
              {fill(plural(loteCopy, "lote.toqueue", cases), {
                n: formatNumber(cases),
              })}
            </Button>
          )}
          {failed === "queue" && error}
        </div>
      )}
      {checked > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {watching ? (
            <StatusPill tone="monitor">
              {loteCopy["lote.monitor.on"]}
            </StatusPill>
          ) : (
            <Button
              variant="secondary"
              size="panel"
              busy={busy === "monitor"}
              onClick={() => void run("monitor")}
            >
              {loteCopy["lote.monitor"]}
            </Button>
          )}
          {failed === "monitor" && error}
        </div>
      )}
    </div>
  );
}
