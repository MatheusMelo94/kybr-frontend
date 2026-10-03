import type { JSX } from "react";

import { caseCopy } from "@/features/seller-link/copy/case";
import { pendingCopy } from "@/features/seller-link/copy/pending";
import { blockedCopy } from "@/features/seller-link/copy/blocked";
import { resultsCopy } from "@/features/seller-link/copy/results";
import { fill, primeiroNome } from "@/features/seller-link/format";
import type { CaseViewKey } from "@/features/seller-link/types";
import type { PublicCase } from "@/lib/api/schemas/public-link";

type Props = {
  viewKey: CaseViewKey;
  publicCase: PublicCase;
};

/** The case page's view for `viewKey` (plan § 3, case page). */
export function CaseContent({ viewKey, publicCase }: Props): JSX.Element {
  const responsavel = publicCase.resultado?.responsavel ?? "";
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
        <h1 className="text-title font-title">
          {fill(resultsCopy["approved.h1"], {
            primeiro_nome: primeiroNome(responsavel),
          })}
        </h1>
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
