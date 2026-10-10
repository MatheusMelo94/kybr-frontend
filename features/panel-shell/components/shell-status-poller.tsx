"use client";

import { useEffect, useRef, type JSX } from "react";

import {
  pollShellStatusAction,
  type ShellStatusResult,
} from "@/features/panel-shell/actions";
import {
  SHELL_STATUS_INTERVAL_MS,
  canPoll,
} from "@/features/panel-shell/polling";
import { useShellStatus } from "@/features/panel-shell/shell-status-context";
import { useSessionExpiry } from "@/features/panel-shell/use-session-expiry";

/**
 * Refreshes the shell's counts and plan every 60 s while the tab is visible
 * and online, and once on becoming visible or online (ADR-0011 rule 3).
 * Never router.refresh(): only the polled projection changes. Nothing
 * fires while a Fila decision has paused it (plan-m6 § 3.3). A failure
 * hides the counts silently (AC 11); the next success restores them. A
 * missing session is SESSAO_EXPIRADA (ADR-0011 Addendum 2): the session-
 * expiry path once (perdido=1 when a dialog holds a draft), and no more polls.
 */
export function ShellStatusPoller(): JSX.Element | null {
  const { update, pollRequests, isPaused } = useShellStatus();
  const inFlight = useRef(false);
  const updateRef = useRef(update);
  updateRef.current = update;
  const pausedRef = useRef(isPaused);
  pausedRef.current = isPaused;
  const expire = useSessionExpiry();
  const expireRef = useRef(expire);
  expireRef.current = expire;
  const expired = useRef(false);
  const pollRef = useRef<() => Promise<void>>(async () => undefined);

  // pollNow(): a poll right away (a Lote batch ended: the plan's usage moved).
  useEffect(() => {
    if (pollRequests > 0) void pollRef.current();
  }, [pollRequests]);

  useEffect(() => {
    async function poll(): Promise<void> {
      if (
        expired.current ||
        inFlight.current ||
        pausedRef.current() ||
        !canPoll()
      )
        return;
      inFlight.current = true;
      let result: ShellStatusResult;
      try {
        result = await pollShellStatusAction();
      } catch {
        result = { ok: false, code: "FAILED" };
      }
      inFlight.current = false;
      if (!result.ok && result.code === "SESSAO_EXPIRADA") {
        expired.current = true;
        expireRef.current();
        return;
      }
      updateRef.current(
        result.ok
          ? { contagens: result.contagens, plano: result.plano }
          : { contagens: undefined, plano: undefined },
      );
    }

    pollRef.current = poll;
    const timer = setInterval(() => void poll(), SHELL_STATUS_INTERVAL_MS);
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
