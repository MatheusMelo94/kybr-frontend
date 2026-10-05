"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type JSX } from "react";

import { LiveRegion } from "@/components/ui/live-region";
import {
  pollBatchAction,
  type PollResult,
} from "@/features/panel-lote/actions";
import { useBatchFocus } from "@/features/panel-lote/components/batch-focus-keeper";
import { loteCopy } from "@/features/panel-lote/copy";
import { fill, formatNumber } from "@/features/panel-shell/format";
import {
  BATCH_PROGRESS_INTERVAL_MS,
  canPoll,
} from "@/features/panel-shell/polling";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

type Props = {
  batchId: string;
  /** The server's read when the page rendered. */
  initial: { processados: number; total: number };
};

const TERMINAL = new Set(["concluido", "concluido_com_erros", "falhou"]);
/**
 * A router.refresh() issued as the poll's Server Action settles can be
 * dropped by the router's queue; while this progress is still on screen
 * after the end, it asks again at the next tick, up to this many times.
 */
const MAX_REFRESHES = 5;

function step(processados: number, total: number): number {
  return total === 0 ? 10 : Math.floor((processados / total) * 10);
}

/**
 * S7 processing (AC 19): a determinate bar and count, polled every 2 s while
 * the tab is visible and online (once on becoming so; never overlapping).
 * Announces the start, then at most once per 10 % step crossed. A failed
 * poll, or being offline (QA Q18), shows lote.progress.stale with the last
 * numbers. On the end: the shell's running flag cleared, whether focus was
 * here recorded for the result (T82), and one router.refresh(): the server
 * renders the result or the stopped batch, and the shell takes its fresh /me.
 */
export function BatchProgress({ batchId, initial }: Props): JSX.Element {
  const [progress, setProgress] = useState(initial);
  const [stale, setStale] = useState(false);
  const total = formatNumber(progress.total);
  const heading = fill(loteCopy["lote.progress.h"], { total });
  const [announcement, setAnnouncement] = useState(heading);
  const announcedStep = useRef(step(initial.processados, initial.total));
  const region = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const router = useRouter();
  const expire = useSessionExpiry();
  const focus = useBatchFocus();
  const { setLoteRunning } = useShellStatus();
  const done = useRef(false);
  const refreshes = useRef(0);

  // QA Q6: after the start, focus lands on this heading, once per view.
  useEffect(() => {
    if (focus.claimArrivalFocus()) headingRef.current?.focus();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let inFlight = false;

    function apply(result: PollResult): void {
      if (!result.ok) {
        if (result.code === "SESSAO_EXPIRADA") {
          // Once: the page is leaving for /entrar.
          done.current = true;
          refreshes.current = MAX_REFRESHES;
          expire();
        } else if (result.code === "NOT_FOUND") {
          done.current = true;
          refresh();
        } else setStale(true);
        return;
      }
      const { estado, processados, total: batchTotal } = result.batch;
      setStale(!navigator.onLine);
      setProgress({ processados, total: batchTotal });
      const now = step(processados, batchTotal);
      if (now > announcedStep.current) {
        announcedStep.current = now;
        setAnnouncement(
          fill(loteCopy["lote.progress.count"], {
            processados: formatNumber(processados),
            total: formatNumber(batchTotal),
          }),
        );
      }
      if (TERMINAL.has(estado) && !done.current) {
        done.current = true;
        focus.record(region.current?.contains(document.activeElement) ?? false);
        setLoteRunning(false);
        // The refresh re-renders the panel layout too: the shell takes its
        // fresh /me (the plan's usage) from it. A second action here would
        // race the refresh.
        refresh();
      }
    }

    function refresh(): void {
      if (refreshes.current >= MAX_REFRESHES) return;
      refreshes.current += 1;
      router.refresh();
    }

    async function poll(): Promise<void> {
      // Ended, yet still here: the refresh didn't take; ask again.
      if (done.current) {
        refresh();
        return;
      }
      if (inFlight) return;
      if (!canPoll()) {
        if (!navigator.onLine) setStale(true);
        return;
      }
      inFlight = true;
      let result: PollResult;
      try {
        result = await pollBatchAction({ batchId });
      } catch {
        result = { ok: false, code: "FAILED" };
      }
      inFlight = false;
      apply(result);
    }

    const timer = setInterval(() => void poll(), BATCH_PROGRESS_INTERVAL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void poll();
    };
    const onOnline = (): void => void poll();
    const onOffline = (): void => setStale(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [batchId, expire, focus, router, setLoteRunning]);

  const ratio =
    progress.total === 0
      ? 1
      : Math.min(1, progress.processados / progress.total);

  return (
    <section
      ref={region}
      aria-labelledby="lote-progress-h"
      className="flex flex-col gap-3"
    >
      <h2
        id="lote-progress-h"
        ref={headingRef}
        tabIndex={-1}
        className="text-h2 font-title text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {heading}
      </h2>
      <div
        role="progressbar"
        aria-labelledby="lote-progress-h"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.processados}
        className="h-2 w-full overflow-hidden rounded-full bg-field"
      >
        {/* Progress isn't a signal: the fill is ink (DDR-0003). */}
        <div
          className="h-full w-full origin-left bg-ink transition-transform duration-(--duration-base) ease-out-quart motion-reduce:transition-none"
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
      <p className="text-body text-ink tabular-nums">
        {fill(loteCopy["lote.progress.count"], {
          processados: formatNumber(progress.processados),
          total,
        })}
      </p>
      {stale && (
        <p className="text-secondary text-ink-muted">
          {loteCopy["lote.progress.stale"]}
        </p>
      )}
      <p className="text-secondary text-ink-muted">
        {loteCopy["lote.progress.leave"]}
      </p>
      <LiveRegion className="sr-only">{announcement}</LiveRegion>
    </section>
  );
}
