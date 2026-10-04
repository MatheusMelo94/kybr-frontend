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

type Props = {
  /** The session ended (default: useSessionExpiry(), once, AC 7). */
  onSessionExpired?: () => void;
};

/**
 * Refreshes the shell's counts and plan every 60 s while the tab is visible
 * and online, and once on becoming visible or online (ADR-0011 rule 3).
 * Never router.refresh(): only the polled projection changes. A failure
 * hides the counts silently (AC 11); the next success restores them.
 */
export function ShellStatusPoller({
  onSessionExpired,
}: Props): JSX.Element | null {
  const { update } = useShellStatus();
  const expire = useSessionExpiry();
  const stopped = useRef(false);
  const inFlight = useRef(false);
  const handlers = useRef({
    update,
    onSessionExpired: onSessionExpired ?? expire,
  });
  handlers.current = { update, onSessionExpired: onSessionExpired ?? expire };

  useEffect(() => {
    async function poll(): Promise<void> {
      if (stopped.current || inFlight.current || !canPoll()) return;
      inFlight.current = true;
      let result: ShellStatusResult;
      try {
        result = await pollShellStatusAction();
      } catch {
        result = { ok: false, code: "FAILED" };
      }
      inFlight.current = false;
      if (stopped.current) return;
      if (result.ok) {
        handlers.current.update({
          contagens: result.contagens,
          plano: result.plano,
        });
      } else if (result.code === "SESSAO_EXPIRADA") {
        stopped.current = true;
        handlers.current.onSessionExpired();
      } else {
        handlers.current.update({ contagens: undefined, plano: undefined });
      }
    }

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
