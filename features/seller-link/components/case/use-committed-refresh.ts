"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/** The rule 11 workaround's bounds, as in CaseLiveStatus's LIVE_STATUS_SCHEDULE.nudge. */
export const REFRESH_NUDGE = { everyMs: 250, maxTicks: 40 } as const;

/**
 * router.refresh() for the case page's follow-up leaves (the upload after a
 * 201, the e-mail block on CASO_DECIDIDO). It's dispatched from a committed
 * render, not straight after the request resolves, and Next 15.5 / React 19.2
 * can still leave it uncommitted until another update happens (tech-design § 3
 * rule 11). So until `settled`, an urgent no-op re-render runs every 250 ms:
 * never while hidden, at most 40 times (10 s), and never past unmount (a view
 * change remounts the leaf). Remove together with rule 11's nudge.
 *
 * @param settled true once the server's render shows the change; leaves that
 *   disappear on the change pass false and stop by unmounting.
 */
export function useCommittedRefresh(settled: boolean): () => void {
  const router = useRouter();
  const [requests, setRequests] = useState(0);
  const [, setNudges] = useState(0);

  useEffect(() => {
    if (requests > 0) router.refresh();
  }, [requests, router]);

  const waiting = requests > 0 && !settled;
  useEffect(() => {
    if (!waiting) return;
    let ticks = 0;
    const nudge = setInterval(() => {
      if (document.hidden) return;
      ticks += 1;
      if (ticks > REFRESH_NUDGE.maxTicks) clearInterval(nudge);
      else setNudges((count) => count + 1);
    }, REFRESH_NUDGE.everyMs);
    return () => clearInterval(nudge);
  }, [waiting, requests]);

  return useCallback(() => setRequests((count) => count + 1), []);
}
