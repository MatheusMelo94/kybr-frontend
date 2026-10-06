import type { JSX } from "react";

import { AutoSelectOldest } from "@/features/panel-fila/components/auto-select-oldest";
import { DetailSkeleton } from "@/features/panel-fila/components/detail-skeleton";
import { EmptyOpen } from "@/features/panel-fila/components/empty-open";
import { EmptyWaiting } from "@/features/panel-fila/components/empty-waiting";
import {
  estadoOf,
  filaHref,
  type FilaSearch,
} from "@/features/panel-fila/search-params";
import { listCasesForPage } from "@/lib/api/panel/cases";

/**
 * /fila's detail pane (lg and up) before a case opens: the empty message in
 * place of a blank pane (AC 46, spec S6), nothing when the list failed (its
 * banner says so), else the skeleton until the oldest case opens (D4).
 * Reads the same cached list as CaseList: one request.
 */
export async function IdleDetail({
  aba,
  ate,
}: FilaSearch): Promise<JSX.Element | null> {
  const result = await listCasesForPage(estadoOf(aba), ate);
  if (!result.ok) return null;
  const [oldest] = result.page.itens;
  if (oldest)
    return (
      <>
        <DetailSkeleton />
        <AutoSelectOldest
          oldestId={oldest.id}
          query={filaHref("", { aba, ate })}
        />
      </>
    );
  return aba === "aberto" ? <EmptyOpen /> : <EmptyWaiting />;
}
