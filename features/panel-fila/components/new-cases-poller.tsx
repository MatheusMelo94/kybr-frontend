"use client";

import { useEffect, useRef } from "react";

import {
  pollNewCasesAction,
  type NewCasesResult,
} from "@/features/panel-fila/poll-action";
import { useFila } from "@/features/panel-fila/components/fila-provider";
import {
  FILA_NEW_CASES_INTERVAL_MS,
  canPoll,
} from "@/features/panel-shell/polling";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

/**
 * The Fila's new-case poll (T110, AC 40; ADR-0011 rule 3): every 60 s while
 * the tab is visible and online, once on becoming visible or online (T111), never two at
 * once and not while a decision has paused the shell's polls. A layout leaf,
 * so both Fila pages own pollNewCasesAction. It only sets the notice's
 * count, for the snapshot generation it asked about (E4); never a refresh.
 * A poll that gets through ends T111's NETWORK hint. A failure keeps the
 * last state; SESSAO_EXPIRADA takes the session-expiry
 * path once (Addendum 2) and stops.
 */
export function NewCasesPoller(): null {
  const { pollTarget, reportNovos, reachable } = useFila();
  const { isPaused } = useShellStatus();
  const expire = useSessionExpiry();
  const latest = useRef({
    pollTarget,
    reportNovos,
    reachable,
    isPaused,
    expire,
  });
  useEffect(() => {
    latest.current = { pollTarget, reportNovos, reachable, isPaused, expire };
  });

  useEffect(() => {
    let inFlight = false;
    let expired = false;

    async function poll(): Promise<void> {
      const { pollTarget: target, isPaused: paused } = latest.current;
      const at = target();
      if (expired || inFlight || at === null || paused() || !canPoll()) return;
      inFlight = true;
      let result: NewCasesResult;
      try {
        result = await pollNewCasesAction({ desde: at.desde });
      } catch {
        result = { ok: false, code: "FAILED" };
      }
      inFlight = false;
      if (result.ok) {
        latest.current.reachable();
        latest.current.reportNovos(result.novos, at.gen);
      } else if (result.code === "SESSAO_EXPIRADA") {
        expired = true;
        latest.current.expire();
      }
    }

    const timer = setInterval(() => void poll(), FILA_NEW_CASES_INTERVAL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void poll();
    };
    const onOnline = (): void => void poll();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
