import type { JSX } from "react";

import { AnalysisView } from "@/features/seller-link/components/case/analysis-view";
import { ApprovedView } from "@/features/seller-link/components/case/approved-view";
import { BlockedView } from "@/features/seller-link/components/case/blocked-view";
import { CaseLiveStatus } from "@/features/seller-link/components/case/case-live-status";
import { PendingView } from "@/features/seller-link/components/case/pending-view";
import { VerifyingView } from "@/features/seller-link/components/case/verifying-view";
import { caseAnnouncement } from "@/features/seller-link/case-announcement";
import type { CaseView } from "@/features/seller-link/types";
import type {
  CaseResult,
  PublicCase,
  PublicLink,
} from "@/lib/api/schemas/public-link";

type Props = {
  /** The validated route params, for the status checks. */
  slug: string;
  token: string;
  view: CaseView;
  publicCase: PublicCase;
  /** The link info from D1: the workspace name and the seller contact. */
  link: PublicLink;
};

/**
 * A result view's data. deriveCaseView returns a result key only once the
 * case has left processing, and the schema requires resultado from then on.
 */
function resultOf(publicCase: PublicCase): CaseResult {
  if (publicCase.resultado === undefined)
    throw new Error("A result view needs a case with a resultado");
  return publicCase.resultado;
}

/** The case page's view (plan § 3, case page; tech-design § 2). */
export function CaseContent({
  slug,
  token,
  view,
  publicCase,
  link,
}: Props): JSX.Element {
  switch (view.viewKey) {
    case "verifying":
      // Both nodes render on the server; the client swaps them at 10 s.
      return (
        <CaseLiveStatus
          mode="switch"
          slug={slug}
          token={token}
          msUntilTimeout={view.msUntilTimeout}
          verifying={<VerifyingView />}
          analysis={<AnalysisView variant="timeout" />}
          analysisAnnouncement={caseAnnouncement(
            "analysis-timeout",
            publicCase,
          )}
        />
      );
    case "analysis-timeout":
    case "analysis-notfound":
      // Checks continue while the page is open (spec AC 17).
      return (
        <>
          <CaseLiveStatus
            mode="watch"
            slug={slug}
            token={token}
            viewKey={view.viewKey}
          />
          <AnalysisView
            variant={
              view.viewKey === "analysis-timeout" ? "timeout" : "notfound"
            }
          />
        </>
      );
    case "approved":
      return (
        <ApprovedView
          resultado={resultOf(publicCase)}
          marketplace={link.nome}
        />
      );
    case "pending":
      return <PendingView resultado={resultOf(publicCase)} />;
    case "blocked":
      return (
        <BlockedView
          resultado={resultOf(publicCase)}
          marketplace={link.nome}
          contact={link.contato_vendedor}
        />
      );
  }
}
