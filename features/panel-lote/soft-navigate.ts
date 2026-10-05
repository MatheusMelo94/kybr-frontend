"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/** How long a soft navigation may take before the full one replaces it. */
export const STALL_MS = 4_000;

function fullNavigate(url: string): void {
  window.location.replace(url);
}

/**
 * A soft router.replace() for Lote's in-page navigations (the result table's
 * filter and pager), with a fallback. On Next 15.5 such a navigation that
 * changes only the query on /lote/[batchId] fetched its payload (200) but now
 * and then never committed (E2E, T83). If the URL hasn't become the target
 * after 4 s, the same URL loads fully, so Renata is never stuck.
 * Pre-Convention: a workaround pending the Architect's investigation.
 */
export function useSoftNavigate(
  onStall: (url: string) => void = fullNavigate,
): (url: string) => void {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(
    (url: string) => {
      if (timer.current !== null) clearTimeout(timer.current);
      router.replace(url, { scroll: false });
      timer.current = setTimeout(() => {
        timer.current = null;
        const here = window.location.pathname + window.location.search;
        if (here !== url) onStall(url);
      }, STALL_MS);
    },
    [onStall, router],
  );
}
