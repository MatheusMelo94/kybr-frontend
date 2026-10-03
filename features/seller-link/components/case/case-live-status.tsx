"use client";

import { useEffect, useState, type JSX, type ReactNode } from "react";

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
};

/**
 * The case page's live status (tech-design § 3), switch mode: at
 * msUntilTimeout it swaps the verifying node for the analysis node on the
 * client, with no server round trip, so the switch also happens offline.
 */
export function CaseLiveStatus({
  msUntilTimeout,
  verifying,
  analysis,
}: Props): JSX.Element {
  const [timedOut, setTimedOut] = useState(msUntilTimeout <= 0);

  useEffect(() => {
    if (timedOut) return;
    const timer = setTimeout(() => setTimedOut(true), msUntilTimeout);
    return () => clearTimeout(timer);
  }, [timedOut, msUntilTimeout]);

  return <>{timedOut ? analysis : verifying}</>;
}
