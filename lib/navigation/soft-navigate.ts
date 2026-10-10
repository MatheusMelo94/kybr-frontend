"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import {
  currentUrl,
  navigationGeneration,
  nextNavigationGeneration,
} from "@/lib/navigation/navigation-guard";

/** How long a soft navigation may take before the full one replaces it. */
export const STALL_MS = 4_000;

/** The full load both fallbacks use (soft navigations, BatchProgress P5-004). */
export function fullNavigate(url: string): void {
  window.location.replace(url);
}

// R1 (T105): every soft navigation, from any instance, takes the next
// generation (navigation-guard.ts). A timer acts only for the latest one, so
// a timer that outlived its navigation can never move Renata.

export type SoftNavigateOptions = {
  /** A new history entry (opening a case, T99) instead of a replace. */
  push?: boolean;
  /** Scroll to the top (one-pane layouts); default false. */
  scroll?: boolean;
};

/**
 * A soft router.replace() (or push(): opening a Fila case) for in-page
 * navigations (Lote's result table's filter and pager, the Fila's tabs and
 * cases), with a fallback. On Next 15.5 such a navigation that
 * changes only the query on /lote/[batchId] fetched its payload (200) but now
 * and then never committed (E2E, T83). If the URL hasn't become the target
 * after 4 s, the same URL loads fully, so Renata is never stuck. The
 * fallback acts only if the location is still the origin and no newer soft
 * navigation started (R1, T105); unmounting cancels it.
 * Pre-Convention: a workaround pending the Architect's investigation
 * (plan-m6 § 17 drift 2). Delete when a Next patch commits these
 * navigations reliably (looped E2E in T105).
 */
export function useSoftNavigate(
  onStall: (url: string) => void = fullNavigate,
): (url: string, options?: SoftNavigateOptions) => void {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (
      url: string,
      { push = false, scroll = false }: SoftNavigateOptions = {},
    ) => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      const origin = currentUrl();
      const mine = nextNavigationGeneration();
      if (push) router.push(url, { scroll });
      else router.replace(url, { scroll });
      // Already there: nothing can stall.
      if (url === origin) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        // A stall is "still on the origin" (never "not on the target": the
        // user may have moved on since), and only for the latest navigation.
        if (mine === navigationGeneration() && currentUrl() === origin)
          onStall(url);
      }, STALL_MS);
    },
    [onStall, router],
  );
}
