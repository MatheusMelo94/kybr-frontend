import type { JSX, ReactNode } from "react";

import { ChangeBlock } from "@/features/panel-fila/components/change-block";
import { CheckList } from "@/features/panel-fila/components/check-list";
import { Consulted } from "@/features/panel-fila/components/consulted";
import { DecidedBanner } from "@/features/panel-fila/components/decided-banner";
import { DocumentList } from "@/features/panel-fila/components/document-list";
import { NoDataBlock } from "@/features/panel-fila/components/no-data-block";
import { ProofDownload } from "@/features/panel-fila/components/proof-download";
import { PartialNotice } from "@/features/panel-fila/components/partial-notice";
import { SellerBlock } from "@/features/panel-fila/components/seller-block";
import { Timeline } from "@/features/panel-fila/components/timeline";
import { VerdictHeader } from "@/features/panel-fila/components/verdict-header";
import type { CaseView } from "@/lib/api/panel/cases";

type Props = {
  view: CaseView;
  /** The render's clock (the history's relative dates). */
  now: Date;
  /** PANEL_DOCUMENTS_MODE, read by the page (Q1, Q19). */
  documentsMode?: "redirect" | "attachment" | undefined;
  /** Under the decided banner: the page's ConflictNotice (T106). */
  decidedNotice?: ReactNode;
  /**
   * "below-lg" when CaseActions follows with the proof as its last action
   * at lg (spec J4: primary, Pedir, Bloquear, Baixar comprovante); below
   * lg it stays in the body, before the sticky bar (G8).
   */
  proofInBody?: "always" | "below-lg";
};

/**
 * The case detail (spec S6), a container (@container/detail) so the same
 * component fits the 3/5 pane and the full width. A block that didn't load
 * (eventos / documentos, D-C2) is left out with fila.detail.partial. T104+
 * add the actions.
 */
export function CaseDetail({
  view,
  now,
  documentsMode,
  decidedNotice,
  proofInBody = "always",
}: Props): JSX.Element {
  const partial = view.eventos === undefined || view.documentos === undefined;
  return (
    <article className="@container/detail flex flex-col gap-6">
      <VerdictHeader view={view} />
      {view.estado === "decidido" && view.decisao && (
        <DecidedBanner decisao={view.decisao} />
      )}
      {/* A live region: mounted with the detail, decided or not (P6-003). */}
      {decidedNotice}
      {view.origem === "monitoramento" && view.mudanca && (
        <ChangeBlock mudanca={view.mudanca} />
      )}
      {view.variante === "DADOS_NAO_ENCONTRADOS" ? (
        <NoDataBlock />
      ) : (
        <CheckList view={view} />
      )}
      <Consulted view={view} />
      <SellerBlock view={view} />
      {partial && <PartialNotice />}
      {view.documentos && (
        <DocumentList
          caseId={view.id}
          documentos={view.documentos}
          mode={documentsMode}
        />
      )}
      {view.eventos && <Timeline eventos={view.eventos} now={now} />}
      {/* D7: no data means no proof. */}
      {view.variante !== "DADOS_NAO_ENCONTRADOS" && (
        <ProofDownload
          href={`/fila/${encodeURIComponent(view.id)}/comprovante`}
          {...(proofInBody === "below-lg" && { className: "lg:hidden" })}
        />
      )}
    </article>
  );
}
