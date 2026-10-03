import { blockedCopy } from "@/features/seller-link/copy/blocked";
import { caseCopy } from "@/features/seller-link/copy/case";
import { pendingCopy } from "@/features/seller-link/copy/pending";
import { resultsCopy } from "@/features/seller-link/copy/results";
import { fill, primeiroNome } from "@/features/seller-link/format";
import type { CaseViewKey } from "@/features/seller-link/types";
import type { PublicCase } from "@/lib/api/schemas/public-link";

/**
 * What the case page's polite region says when a view shows (spec
 * § Accessibility Acceptance): the verificando status, or the new view's
 * heading when a result or *em análise* arrives. Computed on the server, so
 * no copy ships to the browser for it.
 */
export function caseAnnouncement(
  viewKey: CaseViewKey,
  publicCase: PublicCase,
): string {
  switch (viewKey) {
    case "verifying":
      return caseCopy["verifying.status"];
    case "analysis-timeout":
    case "analysis-notfound":
      return caseCopy["analysis.h1"];
    case "approved":
      return fill(resultsCopy["approved.h1"], {
        primeiro_nome: primeiroNome(publicCase.resultado?.responsavel ?? ""),
      });
    case "pending":
      return pendingCopy["pending.h1"];
    case "blocked":
      return blockedCopy["blocked.h1"];
  }
}
