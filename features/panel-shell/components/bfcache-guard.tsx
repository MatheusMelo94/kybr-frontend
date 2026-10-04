"use client";

import { useEffect } from "react";

/**
 * After "Sair", the browser's Back can restore a panel page from the
 * back-forward cache without asking the server (AC 8, P15). A restored page
 * reloads, so middleware and the DAL decide again (and send to /entrar).
 * Panel HTML is also Cache-Control: private, no-store (ADR-0008 rule 9).
 */
export function BfcacheGuard(): null {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return null;
}
