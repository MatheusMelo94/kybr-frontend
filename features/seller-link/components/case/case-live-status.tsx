"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";

import {
  pollCaseViewAction,
  type PollCaseViewResult,
} from "@/features/seller-link/actions";
import { useAnnounceViewChange } from "@/features/seller-link/components/case/case-view-transition";
import type { CaseViewKey } from "@/features/seller-link/types";

// Check cadence (plan § 1.3; contract D4 polling load).
const CHECK_WHILE_VERIFYING_MS = 2_000;
const CHECK_WHILE_ANALYSIS_MS = 10_000;
/** After a non-network failure, retry quietly (tech-design § 3 rule 7). */
const RETRY_AFTER_FAILURE_MS = 5_000;
/** While a refresh is outstanding, re-render this often (see refreshing below). */
const REFRESH_NUDGE_MS = 250;

type CaseRef = {
  slug: string;
  token: string;
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
  /** *Em análise* rendered by the server: check every 10 s, render nothing. */
  mode: "watch";
  viewKey: "analysis-timeout" | "analysis-notfound";
};

type Props = SwitchProps | WatchProps;

/**
 * The case page's live status (tech-design § 3; ADR-0004a).
 *
 * - Switch mode swaps the verifying node for the analysis node at
 *   msUntilTimeout, on the client and with no server round trip, so it also
 *   happens offline, and reports it to CaseViewTransition (rule 3).
 * - Both modes check the case through pollCaseViewAction: every 2 s while
 *   verifying, every 10 s on *em análise*, one at a time (rules 1, 8), paused
 *   while the tab is hidden and run at once when it's visible again (rule 6).
 * - router.refresh() runs only after a successful check returns a different
 *   view, or not-found (rules 2, 7), and checking stops there: the server's
 *   render takes over. A failed check is retried quietly after 5 s (rule 7).
 */
export function CaseLiveStatus(props: Props): JSX.Element | null {
  const { slug, token, mode } = props;
  const router = useRouter();
  const announceViewChange = useAnnounceViewChange();

  const msUntilTimeout = mode === "switch" ? props.msUntilTimeout : 0;
  const analysisAnnouncement =
    mode === "switch" ? props.analysisAnnouncement : "";
  const watchedKey = mode === "watch" ? props.viewKey : undefined;

  const [timedOut, setTimedOut] = useState(msUntilTimeout <= 0);
  // True from router.refresh() until the server's new tree replaces this
  // component (a result view unmounts it; *em análise* remounts it).
  const [refreshing, setRefreshing] = useState(false);
  const [, setNudges] = useState(0);
  // The view on screen, for comparing check results. A ref: changing it must
  // not restart the check loop.
  const onScreen = useRef<CaseViewKey>(
    watchedKey ?? (msUntilTimeout > 0 ? "verifying" : "analysis-timeout"),
  );

  // The 10 s switch (rule 3). It fires even while hidden or offline.
  useEffect(() => {
    if (mode !== "switch" || timedOut) return;
    const timer = setTimeout(() => {
      onScreen.current = "analysis-timeout";
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

  // The check loop.
  useEffect(() => {
    if (watchedKey !== undefined) onScreen.current = watchedKey;
    let active = true;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cadence = (): number =>
      onScreen.current === "verifying"
        ? CHECK_WHILE_VERIFYING_MS
        : CHECK_WHILE_ANALYSIS_MS;

    function schedule(ms: number): void {
      clearTimeout(timer);
      timer = setTimeout(() => void check(), ms);
    }

    function refreshTo(viewKey: CaseViewKey | undefined): void {
      active = false;
      if (viewKey !== undefined) onScreen.current = viewKey;
      router.refresh();
      setRefreshing(true);
    }

    async function check(): Promise<void> {
      // Hidden: no reschedule; the visibilitychange listener resumes.
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      let result: PollCaseViewResult;
      try {
        result = await pollCaseViewAction(slug, token);
      } catch {
        // The action couldn't be reached. T27 turns this into the offline
        // state; until then, retry quietly like any failed check.
        inFlight = false;
        if (active) schedule(RETRY_AFTER_FAILURE_MS);
        return;
      }
      inFlight = false;
      if (!active) return;

      if (!result.ok) {
        if (result.reason === "not_found") refreshTo(undefined);
        else schedule(RETRY_AFTER_FAILURE_MS);
        return;
      }
      // Once the switch shows *em análise*, a late "verifying" isn't a change.
      if (result.viewKey !== onScreen.current && result.viewKey !== "verifying")
        refreshTo(result.viewKey);
      else schedule(cadence());
    }

    function onVisibilityChange(): void {
      if (document.hidden) return;
      clearTimeout(timer);
      void check();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    schedule(cadence());
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [slug, token, watchedKey, router]);

  // Next 15.5 / React 19.2: a refresh dispatched right after a Server Action
  // sometimes stays uncommitted until some other React update happens (seen
  // in E2E under load: the result appeared only when the 10 s switch fired, or
  // never). An urgent no-op re-render releases it, so one runs every 250 ms
  // until this component is replaced. Remove when the framework fixes it.
  useEffect(() => {
    if (!refreshing) return;
    const nudge = setInterval(
      () => setNudges((count) => count + 1),
      REFRESH_NUDGE_MS,
    );
    return () => clearInterval(nudge);
  }, [refreshing]);

  if (mode === "watch") return null;
  return <>{timedOut ? props.analysis : props.verifying}</>;
}
