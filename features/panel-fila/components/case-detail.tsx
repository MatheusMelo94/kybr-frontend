import type { JSX } from "react";

import { ChangeBlock } from "@/features/panel-fila/components/change-block";
import { CheckList } from "@/features/panel-fila/components/check-list";
import { Consulted } from "@/features/panel-fila/components/consulted";
import { NoDataBlock } from "@/features/panel-fila/components/no-data-block";
import { VerdictHeader } from "@/features/panel-fila/components/verdict-header";
import type { CaseView } from "@/lib/api/panel/cases";

type Props = { view: CaseView };

/**
 * The case detail (spec S6), a container (@container/detail) so the same
 * component fits the 3/5 pane and the full width. T101 adds the seller,
 * documents, history and decided states; T104+ the actions.
 */
export function CaseDetail({ view }: Props): JSX.Element {
  return (
    <article className="@container/detail flex flex-col gap-6">
      <VerdictHeader view={view} />
      {view.origem === "monitoramento" && view.mudanca && (
        <ChangeBlock mudanca={view.mudanca} />
      )}
      {view.variante === "DADOS_NAO_ENCONTRADOS" ? (
        <NoDataBlock />
      ) : (
        <CheckList view={view} />
      )}
      <Consulted view={view} />
    </article>
  );
}
