import type { JSX } from "react";

import { ApprovedView } from "@/features/seller-link/components/case/approved-view";
import { BlockedView } from "@/features/seller-link/components/case/blocked-view";
import { PendingView } from "@/features/seller-link/components/case/pending-view";
import { caseCopy } from "@/features/seller-link/copy/case";
import type { CaseViewKey } from "@/features/seller-link/types";
import type {
  CaseResult,
  PublicCase,
  PublicLink,
} from "@/lib/api/schemas/public-link";

type Props = {
  viewKey: CaseViewKey;
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

/** The case page's view for `viewKey` (plan § 3, case page). */
export function CaseContent({ viewKey, publicCase, link }: Props): JSX.Element {
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
