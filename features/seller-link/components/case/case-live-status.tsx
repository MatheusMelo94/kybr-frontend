"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";

import { LiveRegion } from "@/components/ui/live-region";
import {
  pollCaseViewAction,
  type PollCaseViewResult,
} from "@/features/seller-link/actions";
import { useAnnounceViewChange } from "@/features/seller-link/components/case/case-view-transition";
import type { CaseViewKey } from "@/features/seller-link/types";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/**
 * Every timing number of the live status, in one place (plan § 1.3,
 * tech-design § 3, Architect's schedule for security finding M2-02/M2-04).
 */
export const LIVE_STATUS_SCHEDULE = {
  /** *Verificando*: one check every 2 s (the switch itself is at 10 s, server-computed). */
  verifyingEveryMs: 2 * SECOND,
  /**
   * *Em análise*: the cadence by visible time since it appeared on this page.
   * Past the last rung's `untilMs` (2 h), checks stop.
   */
  analysisLadder: [
    { untilMs: 5 * MINUTE, everyMs: 10 * SECOND },
    { untilMs: 30 * MINUTE, everyMs: 30 * SECOND },
    { untilMs: 120 * MINUTE, everyMs: 60 * SECOND },
  ],
  /** Non-network failures: max(cadence, baseMs × 2^(n−1)), at most maxMs. */
  failureBackoff: { baseMs: 5 * SECOND, maxMs: 60 * SECOND },
  /** After router.refresh(): re-render this often, at most this many times (rule 11). */
  nudge: { everyMs: 250, maxTicks: 40 },
} as const;

// One literal class string or none, so no cn(): it would pull tailwind-merge
// (~9 kB gzip) into this route's client chunk (ADR-0003 budget).
const BANNER_CLASSES =
  "mb-6 rounded-lg bg-surface-raised p-4 text-body text-ink";

type CaseRef = {
  slug: string;
  token: string;
  /** offline.banner, from the server (no copy ships to the browser for it). */
  offlineBanner: string;
};

type SwitchProps = CaseRef & {
  /** *Verificando*: show it, check every 2 s, and switch at 10 s. */
  mode: "switch";
  /**
   * Time left until *verificando* becomes *em análise*, computed on the server
   * from criado_em, so the phone's clock doesn't matter.
   */
  msUntilTimeout: number;
  /** <VerifyingView/>, rendered on the server. */
  verifying: ReactNode;
  /** <AnalysisView variant="timeout"/>, rendered on the server. */
  analysis: ReactNode;
  /** What the polite region says when the switch shows *em análise*. */
  analysisAnnouncement: string;
};

type WatchProps = CaseRef & {
  /** *Em análise* rendered by the server: check on the ladder; only the banner renders. */
  mode: "watch";
  viewKey: "analysis-timeout" | "analysis-notfound";
};

type Props = SwitchProps | WatchProps;

/** Visible time on *em análise*, paused while the tab is hidden. */
type AnalysisClock = {
  /** Visible ms already counted. */
  counted: number;
  /** When the current visible stretch began, or null (not started, or hidden). */
  since: number | null;
  started: boolean;
};

function visibleMs(clock: AnalysisClock): number {
  return clock.counted + (clock.since === null ? 0 : Date.now() - clock.since);
}

function startClock(clock: AnalysisClock): void {
  clock.started = true;
  clock.counted = 0;
  clock.since = document.hidden ? null : Date.now();
}

/** A failed fetch: the browser couldn't reach the server (Q2). */
function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

/**
 * The case page's live status (tech-design § 3; ADR-0004a).
 *
 * - Switch mode swaps the verifying node for the analysis node at
 *   msUntilTimeout, on the client and with no server round trip, so it also
 *   happens offline, and reports it to CaseViewTransition (rule 3).
 * - Checks go through pollCaseViewAction, one at a time (rules 1, 8): every
 *   2 s while verifying; on *em análise*, on LIVE_STATUS_SCHEDULE's ladder of
 *   visible time, stopping at 2 h (M2-02). Hidden: paused; visible again:
 *   check at once (rule 6). After the stop, visible or `online` restarts the
 *   ladder.
 * - router.refresh() only after a successful check returns another view, or
 *   not-found (rules 2, 7); a "verifying" after the switch is no change (Q4).
 * - Failures: a network TypeError is the offline state (banner, retry at the
 *   cadence, Q2); anything else, a WAF 429 included, is silent with a capped
 *   exponential backoff (rule 7, M2-04). navigator.onLine false or `offline`
 *   shows the banner and pauses; `online` hides it and checks at once
 *   (rule 5). router.refresh() never runs offline.
 */
export function CaseLiveStatus(props: Props): JSX.Element {
  const { slug, token, mode } = props;
  const router = useRouter();
  const announceViewChange = useAnnounceViewChange();

  const msUntilTimeout = mode === "switch" ? props.msUntilTimeout : 0;
  const analysisAnnouncement =
    mode === "switch" ? props.analysisAnnouncement : "";
  const watchedKey = mode === "watch" ? props.viewKey : undefined;

  const [timedOut, setTimedOut] = useState(msUntilTimeout <= 0);
  const [offline, setOffline] = useState(false);
  // From router.refresh() until the server's new tree remounts this island
  // (the keyed wrapper in CaseViewTransition), or the nudge cap.
  const [refreshing, setRefreshing] = useState(false);
  // Bumped when a refresh gives up waiting, to restart the check loop.
  const [resumes, setResumes] = useState(0);
  const [, setNudges] = useState(0);

  // The view the server (or the client switch) put on screen, for comparing
  // check results. Refs: changing them must not restart the loop.
  const onScreen = useRef<CaseViewKey>(
    watchedKey ?? (msUntilTimeout > 0 ? "verifying" : "analysis-timeout"),
  );
  const clock = useRef<AnalysisClock>({
    counted: 0,
    since: null,
    started: false,
  });

  // *Em análise* on mount (watch mode, or no time left): the ladder starts now.
  useEffect(() => {
    if (onScreen.current !== "verifying" && !clock.current.started)
      startClock(clock.current);
  }, []);

  // The visible-time clock pauses while hidden.
  useEffect(() => {
    function onVisibilityChange(): void {
      const current = clock.current;
      if (!current.started) return;
      if (document.hidden && current.since !== null) {
        current.counted += Date.now() - current.since;
        current.since = null;
      } else if (!document.hidden && current.since === null) {
        current.since = Date.now();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  // The 10 s switch (rule 3). It fires even while hidden or offline.
  useEffect(() => {
    if (mode !== "switch" || timedOut) return;
    const timer = setTimeout(() => {
      onScreen.current = "analysis-timeout";
      startClock(clock.current);
      setTimedOut(true);
      announceViewChange("analysis-timeout", analysisAnnouncement);
    }, msUntilTimeout);
    return () => clearTimeout(timer);
  }, [
    mode,
    timedOut,
    msUntilTimeout,
    announceViewChange,
    analysisAnnouncement,
  ]);

  // The check loop. Stopped while a refresh is pending.
  useEffect(() => {
    if (refreshing) return;
    let active = true;
    let inFlight = false;
    let failures = 0;
    let isOffline = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    /** The cadence now, or null once *em análise* has run its 2 h. */
    function cadence(): number | null {
      if (onScreen.current === "verifying")
        return LIVE_STATUS_SCHEDULE.verifyingEveryMs;
      const { analysisLadder } = LIVE_STATUS_SCHEDULE;
      const elapsed = visibleMs(clock.current);
      const rung = analysisLadder.find(({ untilMs }) => elapsed < untilMs);
      const stopAt = analysisLadder[analysisLadder.length - 1]?.untilMs ?? 0;
      // The last check comes before the stop, never at or after it.
      if (rung === undefined || elapsed + rung.everyMs >= stopAt) return null;
      return rung.everyMs;
    }

    function schedule(ms: number | null): void {
      clearTimeout(timer);
      if (ms === null) {
        stopped = true; // no timer, no banner change
        return;
      }
      timer = setTimeout(() => void check(), ms);
    }

    function backoff(): number | null {
      const base = cadence();
      if (base === null) return null;
      const { baseMs, maxMs } = LIVE_STATUS_SCHEDULE.failureBackoff;
      return Math.min(maxMs, Math.max(base, baseMs * 2 ** (failures - 1)));
    }

    function goOffline(next: boolean): void {
      isOffline = next;
      setOffline(next);
    }

    function refreshTo(): void {
      active = false;
      clearTimeout(timer);
      router.refresh();
      setRefreshing(true);
    }

    async function check(): Promise<void> {
      // Hidden: no reschedule; the visibilitychange listener resumes.
      if (!active || inFlight || document.hidden) return;
      // No connection: wait for the `online` event.
      if (!navigator.onLine) {
        goOffline(true);
        return;
      }
      inFlight = true;
      let result: PollCaseViewResult;
      try {
        result = await pollCaseViewAction(slug, token);
      } catch (error) {
        inFlight = false;
        if (!active) return;
        if (isNetworkError(error)) {
          // The offline state (Q2). The browser may still say online, and no
          // `online` event will come, so keep checking at the cadence.
          goOffline(true);
          if (navigator.onLine) schedule(cadence());
          return;
        }
        // The server answered with something else (a WAF 429, a 5xx page):
        // reachable, so no banner; slow down (M2-04).
        if (isOffline) goOffline(false);
        failures += 1;
        schedule(backoff());
        return;
      }
      inFlight = false;
      if (!active) return;
      if (isOffline) goOffline(false);

      if (!result.ok) {
        if (result.reason === "not_found") {
          refreshTo();
          return;
        }
        failures += 1;
        schedule(backoff());
        return;
      }
      failures = 0;
      // Once the switch shows *em análise*, a late "verifying" isn't a change.
      if (result.viewKey !== onScreen.current && result.viewKey !== "verifying")
        refreshTo();
      else schedule(cadence());
    }

    function checkNow(): void {
      if (stopped) {
        // After the 2 h stop, a return restarts the ladder from 0.
        stopped = false;
        if (onScreen.current !== "verifying") startClock(clock.current);
      }
      clearTimeout(timer);
      void check();
    }

    function onVisibilityChange(): void {
      if (!document.hidden) checkNow();
    }

    function onOffline(): void {
      clearTimeout(timer);
      goOffline(true);
    }

    function onOnline(): void {
      goOffline(false);
      checkNow();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (!navigator.onLine) goOffline(true);
    else if (resumes > 0) checkNow();
    else schedule(cadence());
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [slug, token, router, refreshing, resumes]);

  // Next 15.5 / React 19.2: a refresh dispatched right after a Server Action
  // sometimes stays uncommitted until some other React update happens (seen
  // in E2E under load). An urgent no-op re-render releases it, so one runs
  // every 250 ms from router.refresh() until the new view remounts this
  // island, never while hidden, and at most 40 times (10 s): then checks
  // resume, and the next one refreshes again if the view still differs
  // (tech-design § 3 rule 11). Remove when the framework fixes it.
  useEffect(() => {
    if (!refreshing) return;
    let ticks = 0;
    const nudge = setInterval(() => {
      if (document.hidden) return;
      ticks += 1;
      if (ticks > LIVE_STATUS_SCHEDULE.nudge.maxTicks) {
        clearInterval(nudge);
        setRefreshing(false);
        setResumes((count) => count + 1);
        return;
      }
      setNudges((count) => count + 1);
    }, LIVE_STATUS_SCHEDULE.nudge.everyMs);
    return () => clearInterval(nudge);
  }, [refreshing]);

  // Always mounted, so the banner is announced when its text appears.
  const banner = (
    <LiveRegion className={offline ? BANNER_CLASSES : ""}>
      {offline ? props.offlineBanner : ""}
    </LiveRegion>
  );
  if (mode === "watch") return banner;
  return (
    <>
      {banner}
      {timedOut ? props.analysis : props.verifying}
    </>
  );
}
