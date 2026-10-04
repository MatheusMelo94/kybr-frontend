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

type Props = {
  /** The session ended: hand off to the session-expiry path, once. */
  onSessionExpired?: () => void;
};

/** Until T59's hook: a full load of /entrar that brings Renata back here (AC 7). */
function goToLogin(): void {
  const volta = window.location.pathname + window.location.search;
  window.location.assign(
    `/entrar?motivo=sessao&volta=${encodeURIComponent(volta)}`,
  );
}

/**
 * Refreshes the shell's counts and plan every 60 s while the tab is visible
 * and online, and once on becoming visible or online (ADR-0011 rule 3).
 * Never router.refresh(): only the polled projection changes. A failure
 * hides the counts silently (AC 11); the next success restores them.
 */
export function ShellStatusPoller({
  onSessionExpired = goToLogin,
}: Props): JSX.Element | null {
  const { update } = useShellStatus();
  const stopped = useRef(false);
  const inFlight = useRef(false);
  const handlers = useRef({ update, onSessionExpired });
  handlers.current = { update, onSessionExpired };

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
