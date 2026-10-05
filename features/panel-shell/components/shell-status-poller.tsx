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

/**
 * Refreshes the shell's counts and plan every 60 s while the tab is visible
 * and online, and once on becoming visible or online (ADR-0011 rule 3).
 * Never router.refresh(): only the polled projection changes. A failure
 * hides the counts silently (AC 11); the next success restores them. A
 * missing session is never a result: requireSession() redirects from the
 * action and the client router leaves the shell (ADR-0011 Addendum 1).
 */
export function ShellStatusPoller(): JSX.Element | null {
  const { update } = useShellStatus();
  const inFlight = useRef(false);
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    async function poll(): Promise<void> {
      if (inFlight.current || !canPoll()) return;
      inFlight.current = true;
      let result: ShellStatusResult;
      try {
        result = await pollShellStatusAction();
      } catch {
        result = { ok: false, code: "FAILED" };
      }
      inFlight.current = false;
      updateRef.current(
        result.ok
          ? { contagens: result.contagens, plano: result.plano }
          : { contagens: undefined, plano: undefined },
      );
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
