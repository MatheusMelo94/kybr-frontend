import type { JSX } from "react";

import { ApprovedView } from "@/features/seller-link/components/case/approved-view";
import { blockedCopy } from "@/features/seller-link/copy/blocked";
import { caseCopy } from "@/features/seller-link/copy/case";
import { pendingCopy } from "@/features/seller-link/copy/pending";
import type { CaseViewKey } from "@/features/seller-link/types";
import type { CaseResult, PublicCase } from "@/lib/api/schemas/public-link";

type Props = {
  viewKey: CaseViewKey;
  publicCase: PublicCase;
  /** The workspace name from D1. */
  marketplace: string;
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

/** The case page's view for `viewKey` (plan § 3, case page). */
export function CaseContent({
  viewKey,
  publicCase,
  marketplace,
}: Props): JSX.Element {
  switch (viewKey) {
    case "verifying":
      return (
        <h1 className="text-title font-title">{caseCopy["verifying.h1"]}</h1>
      );
    case "analysis-timeout":
    case "analysis-notfound":
      return (
        <h1 className="text-title font-title">{caseCopy["analysis.h1"]}</h1>
      );
    case "approved":
      return (
        <ApprovedView
          resultado={resultOf(publicCase)}
          marketplace={marketplace}
        />
      );
    case "pending":
      return (
        <h1 className="text-title font-title">{pendingCopy["pending.h1"]}</h1>
      );
    case "blocked":
      return (
        <h1 className="text-title font-title">{blockedCopy["blocked.h1"]}</h1>
      );
  }
}
