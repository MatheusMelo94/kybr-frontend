"use client";

import { useEffect, useState, type JSX, type ReactNode } from "react";

import { useAnnounceViewChange } from "@/features/seller-link/components/case/case-view-transition";

type Props = {
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

/**
 * The case page's live status (tech-design § 3), switch mode: at
 * msUntilTimeout it swaps the verifying node for the analysis node on the
 * client, with no server round trip, so the switch also happens offline. It
 * reports the switch to CaseViewTransition, which focuses and announces it.
 */
export function CaseLiveStatus({
  msUntilTimeout,
  verifying,
  analysis,
  analysisAnnouncement,
}: Props): JSX.Element {
  const announceViewChange = useAnnounceViewChange();
  const [timedOut, setTimedOut] = useState(msUntilTimeout <= 0);

  useEffect(() => {
    if (timedOut) return;
    const timer = setTimeout(() => {
      setTimedOut(true);
      announceViewChange("analysis-timeout", analysisAnnouncement);
    }, msUntilTimeout);
    return () => clearTimeout(timer);
  }, [timedOut, msUntilTimeout, announceViewChange, analysisAnnouncement]);

  return <>{timedOut ? analysis : verifying}</>;
}
