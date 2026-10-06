"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { fullNavigate } from "@/lib/navigation/soft-navigate";

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
 * soft-navigate.ts). Delete when a Next patch commits these navigations
 * reliably (looped E2E in T105).
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

/**
 * router.refresh() until `done()` holds (the Fila: the decided id has left
 * the list, or `renderedAt` changed): now, and again every 2 s while it
 * doesn't, at most 5 times. If the 5th still didn't take, the current URL
 * loads fully, once. `done` is read fresh on every tick.
 * Pre-Convention: the same Next 15.5 workaround as useRefreshUntilReplaced
 * (plan-m6 § 17 drift 2). Delete when a Next patch commits these
 * navigations reliably (looped E2E in T105).
 */
export function useRefreshUntil(
  done: () => boolean,
  onGiveUp: (url: string) => void = fullNavigate,
): () => void {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef(done);

  useEffect(() => {
    latest.current = done;
  }, [done]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearInterval(timer.current);
    },
    [],
  );

  return useCallback(() => {
    const stop = () => {
      if (timer.current !== null) clearInterval(timer.current);
      timer.current = null;
    };
    stop();
    if (latest.current()) return;
    let count = 1;
    router.refresh();
    timer.current = setInterval(() => {
      if (latest.current()) return stop();
      if (count >= MAX_REFRESHES) {
        stop();
        onGiveUp(window.location.pathname + window.location.search);
        return;
      }
      count += 1;
      router.refresh();
    }, EVERY_MS);
  }, [onGiveUp, router]);
}
