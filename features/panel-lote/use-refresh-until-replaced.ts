"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const EVERY_MS = 2_000;
const MAX_REFRESHES = 5;

/**
 * router.refresh() for a view the server is about to replace (a stopped
 * batch that resumes, T85): now, and again every 2 s while this component
 * is still mounted, at most 5 times. On /lote/[batchId] a refresh or an
 * action's revalidated tree was now and then not applied on Next 15.5 (E2E,
 * T81/T84/T85); the view unmounting is the proof it took.
 * Pre-Convention: a workaround for Next 15.5's dropped refreshes, pending
 * the Architect's investigation (P5-004, with BatchProgress and
 * soft-navigate.ts).
 */
export function useRefreshUntilReplaced(): () => void {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearInterval(timer.current);
    },
    [],
  );

  return useCallback(() => {
    let count = 1;
    router.refresh();
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = setInterval(() => {
      if (count >= MAX_REFRESHES) {
        if (timer.current !== null) clearInterval(timer.current);
        timer.current = null;
        return;
      }
      count += 1;
      router.refresh();
    }, EVERY_MS);
  }, [router]);
}
