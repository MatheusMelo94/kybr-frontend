import type { JSX } from "react";

import { CaseListbox } from "@/features/panel-fila/components/case-listbox";
import { CaseOption } from "@/features/panel-fila/components/case-option";
import { EmptyOpen } from "@/features/panel-fila/components/empty-open";
import { EmptyWaiting } from "@/features/panel-fila/components/empty-waiting";
import { ListError } from "@/features/panel-fila/components/list-error";
import { LoadMoreLink } from "@/features/panel-fila/components/load-more-link";
import {
  FILA_ATE_MAX,
  estadoOf,
  filaHref,
  type FilaSearch,
} from "@/features/panel-fila/search-params";
import { listCasesForPage } from "@/lib/api/panel/cases";
import { cn } from "@/lib/utils";

type Props = FilaSearch & {
  /** The open case (/fila/{id}), or null on /fila. */
  selectedId: string | null;
};

/**
 * The list pane's data (D-C1): the cases in the server's order, "Carregar
 * mais" while the API has more (up to 200, Q3), the empty states, or
 * ListError. On /fila at lg the empty message is the detail pane's instead
 * (IdleDetail), so it shows once.
 */
export async function CaseList({
  aba,
  ate,
  selectedId,
}: Props): Promise<JSX.Element> {
  const result = await listCasesForPage(estadoOf(aba), ate);
  if (!result.ok) return <ListError />;
  const { itens, total, gerado_em } = result.page;
  if (itens.length === 0)
    return (
      <div className={cn(selectedId === null && "lg:hidden")}>
        {aba === "aberto" ? <EmptyOpen /> : <EmptyWaiting />}
      </div>
    );

  const base = selectedId === null ? "/fila" : `/fila/${selectedId}`;
  const query = filaHref("", { aba, ate });
  const remaining = total - itens.length;
  return (
    <CaseListbox
      aba={aba}
      selectedId={selectedId}
      query={query}
      generatedAt={gerado_em}
      options={itens.map((item) => ({
        id: item.id,
        content: (
          <CaseOption
            status={item.status}
            razao={item.razao_social ?? item.cnpj}
            motivos={item.motivos}
            origem={item.origem}
            slaAte={item.sla_ate}
            vencido={item.vencido}
            now={gerado_em}
          />
        ),
      }))}
    >
      {remaining > 0 && ate < FILA_ATE_MAX && (
        <LoadMoreLink base={base} aba={aba} ate={ate} remaining={remaining} />
      )}
    </CaseListbox>
  );
}
