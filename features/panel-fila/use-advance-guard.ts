"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { useFila } from "@/features/panel-fila/components/fila-provider";
import { ADVANCE_GUARD_MS } from "@/features/panel-fila/limits";

/**
 * QA-M6-004 (Q4, DF-07): below lg the next case's Aprovar renders where the
 * finger was once an advance lands, so a double tap decided two cases. For
 * ADVANCE_GUARD_MS after the actions of the case an advance landed on mount,
 * or become enabled again, a pointer activation of a decision trigger (the
 * clicks CaseActions routes through onClickCapture) is dropped. A click
 * inside an open dialog is the dialog's own and goes through. The keyboard
 * is never blocked: Enter and Space on a button click with detail 0. The
 * window runs from the actions' first render, not from the tap, so a slow
 * decision can't use it up behind the skeleton. `guarded` is the bar's
 * data-advance-guard.
 */
export function useAdvanceGuard(
  caseId: string,
  enabled: boolean,
): {
  guarded: boolean;
  onClickCapture: (event: MouseEvent<HTMLElement>) => void;
} {
  const { wasAdvancedTo } = useFila();
  const [guarded, setGuarded] = useState(
    () => enabled && wasAdvancedTo(caseId),
  );

  useEffect(() => {
    const arm = enabled && wasAdvancedTo(caseId);
    setGuarded(arm);
    if (!arm) return;
    const timer = setTimeout(() => setGuarded(false), ADVANCE_GUARD_MS);
    return () => clearTimeout(timer);
  }, [caseId, enabled, wasAdvancedTo]);

  const onClickCapture = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!guarded || event.detail === 0) return;
      if (
        event.target instanceof Element &&
        event.target.closest("dialog") !== null
      )
        return;
      event.preventDefault();
      event.stopPropagation();
    },
    [guarded],
  );

  return { guarded, onClickCapture };
}
