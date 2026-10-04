import type { JSX } from "react";

import { AnalysisView } from "@/features/seller-link/components/case/analysis-view";
import { ApprovedView } from "@/features/seller-link/components/case/approved-view";
import { BlockedView } from "@/features/seller-link/components/case/blocked-view";
import { CaseLiveStatus } from "@/features/seller-link/components/case/case-live-status";
import {
  LazyContactEmailBlock,
  LazyDocumentUpload,
  PreloadAnalysisLeaves,
} from "@/features/seller-link/components/case/lazy-leaves";
import { PendingView } from "@/features/seller-link/components/case/pending-view";
import { VerifyingView } from "@/features/seller-link/components/case/verifying-view";
import { caseAnnouncement } from "@/features/seller-link/case-announcement";
import { caseCopy } from "@/features/seller-link/copy/case";
import type { CaseView } from "@/features/seller-link/types";
import type {
  CaseResult,
  PublicCase,
  PublicLink,
} from "@/lib/api/schemas/public-link";
import { apiPaths } from "@/lib/api/path";
import { env } from "@/lib/env";

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

/**
 * D6's URL on API_PUBLIC_BASE_URL, where the browser uploads (ADR-0004b). Built
 * here with the API path helper, so the client never assembles an API path.
 */
function documentsUrl(slug: string, token: string): string {
  return new URL(
    apiPaths.caseDocuments(slug, token),
    env.API_PUBLIC_BASE_URL,
  ).toString();
}

/** The case page's view (plan § 3, case page; tech-design § 2). */
export function CaseContent({
  slug,
  token,
  view,
  publicCase,
  link,
}: Props): JSX.Element {
  // DDR-0001: the e-mail block, on *quase lá* and both *em análise* variants.
  const emailBlock = (
    <LazyContactEmailBlock
      slug={slug}
      token={token}
      maskedSaved={publicCase.resultado?.email_contato_mascarado}
    />
  );
  switch (view.viewKey) {
    case "verifying":
      // Both nodes render on the server; the client swaps them at 10 s.
      return (
        <>
          <PreloadAnalysisLeaves />
          <CaseLiveStatus
            mode="switch"
            slug={slug}
            token={token}
            offlineBanner={caseCopy["offline.banner"]}
            msUntilTimeout={view.msUntilTimeout}
            verifying={<VerifyingView />}
            analysis={
              <AnalysisView variant="timeout" emailBlock={emailBlock} />
            }
            analysisAnnouncement={caseAnnouncement(
              "analysis-timeout",
              publicCase,
            )}
          />
        </>
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
            offlineBanner={caseCopy["offline.banner"]}
            viewKey={view.viewKey}
          />
          <AnalysisView
            variant={
              view.viewKey === "analysis-timeout" ? "timeout" : "notfound"
            }
            emailBlock={emailBlock}
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
      return (
        <PendingView
          resultado={resultOf(publicCase)}
          emailBlock={emailBlock}
          documentAction={(item, titleId) => (
            <LazyDocumentUpload
              uploadUrl={documentsUrl(slug, token)}
              tipo={item.documento_tipo}
              enviados={item.documentos_enviados}
              describedBy={titleId}
            />
          )}
        />
      );
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
