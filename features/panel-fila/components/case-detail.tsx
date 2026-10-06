import type { JSX } from "react";

import { ChangeBlock } from "@/features/panel-fila/components/change-block";
import { CheckList } from "@/features/panel-fila/components/check-list";
import { Consulted } from "@/features/panel-fila/components/consulted";
import { DecidedBanner } from "@/features/panel-fila/components/decided-banner";
import { DocumentList } from "@/features/panel-fila/components/document-list";
import { NoDataBlock } from "@/features/panel-fila/components/no-data-block";
import { PartialNotice } from "@/features/panel-fila/components/partial-notice";
import { SellerBlock } from "@/features/panel-fila/components/seller-block";
import { Timeline } from "@/features/panel-fila/components/timeline";
import { VerdictHeader } from "@/features/panel-fila/components/verdict-header";
import type { CaseView } from "@/lib/api/panel/cases";

type Props = {
  view: CaseView;
  /** The render's clock (the history's relative dates). */
  now: Date;
};

/**
 * The case detail (spec S6), a container (@container/detail) so the same
 * component fits the 3/5 pane and the full width. A block that didn't load
 * (eventos / documentos, D-C2) is left out with fila.detail.partial. T104+
 * add the actions.
 */
export function CaseDetail({ view, now }: Props): JSX.Element {
  const partial = view.eventos === undefined || view.documentos === undefined;
  return (
    <article className="@container/detail flex flex-col gap-6">
      <VerdictHeader view={view} />
      {view.estado === "decidido" && view.decisao && (
        <DecidedBanner decisao={view.decisao} />
      )}
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
        <DocumentList caseId={view.id} documentos={view.documentos} />
      )}
      {view.eventos && <Timeline eventos={view.eventos} now={now} />}
    </article>
  );
}
