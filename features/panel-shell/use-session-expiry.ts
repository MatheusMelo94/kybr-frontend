"use client";

import { useCallback, useContext } from "react";

import { SessionExpiryContext } from "@/features/panel-shell/components/session-expiry-provider";
import { safeReturnPath } from "@/lib/safe-return-path";

/** /entrar with session.expired, the way back (when it's a panel screen), and perdido=1 when input was lost (AC 7). */
export function sessionExpiredHref(current: string, lost: boolean): string {
  const query = new URLSearchParams({ motivo: "sessao" });
  const volta = safeReturnPath(current);
  if (volta !== null) query.set("volta", volta);
  if (lost) query.set("perdido", "1");
  return `/entrar?${query.toString()}`;
}

/**
 * For an action that answered SESSAO_EXPIRADA, and the shell's poller
 * (ADR-0009 rule 7): a full load of /entrar that brings Renata back to this
 * screen. Inside the shell it navigates only once, however many callers fire.
 */
export function useSessionExpiry(): () => void {
  const context = useContext(SessionExpiryContext);
  return useCallback(() => {
    if (context !== null && !context.claimExpiry()) return;
    const current = window.location.pathname + window.location.search;
    window.location.assign(
      sessionExpiredHref(current, context?.hasUnsentInput() ?? false),
    );
  }, [context]);
}
