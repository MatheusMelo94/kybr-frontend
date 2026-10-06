import type { Metadata } from "next";
import { Suspense, type JSX } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { BatchState } from "@/features/panel-lote/components/batch-state";
import { HistoryList } from "@/features/panel-lote/components/history-list";
import { LoteSkeleton } from "@/features/panel-lote/components/lote-skeleton";
import { ResultTableSection } from "@/features/panel-lote/components/result-table-section";
import { WhyCard } from "@/features/panel-lote/components/why-card";
import { loteCopy } from "@/features/panel-lote/copy";
import {
  batchOrExit,
  historyOrError,
  type RowsQuery,
} from "@/features/panel-lote/data";
import { requireSession } from "@/lib/api/panel/session";
import { contratarHref } from "@/lib/panel-config";

export const metadata: Metadata = { title: loteCopy["lote.h1"] };

type Props = {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<RowsQuery>;
};

/**
 * A batch (S7). The loading state is this page's own Suspense (the skeleton
 * streams at once on arrival) instead of a loading.tsx: with the route's
 * loading boundary, in-page navigations that change only ?status= or
 * ?cursor= fetched but didn't commit on Next 15.5 (E2E, T83). Here they keep
 * the current content while the server renders.
 */
export default function BatchPage({
  params,
  searchParams,
}: Props): JSX.Element {
  return (
    <Suspense fallback={<LoteSkeleton />}>
      <BatchBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// Its state from D-B2; on concluido*, the result table driven by ?status=
// and ?cursor= (T83); then the history (plan M5 tree).
async function BatchBody({
  params,
  searchParams,
}: Props): Promise<JSX.Element> {
  const { batchId } = await params;
  await requireSession();
  const batch = await batchOrExit(batchId);
  const finished = batch.estado.startsWith("concluido");
  const history = await historyOrError();
  const query = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-title text-ink">{loteCopy["lote.h1"]}</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <BatchState batch={batch} contratarHref={contratarHref()} />
          {finished && (
            <Suspense fallback={<Skeleton className="h-96 w-full" />}>
              <ResultTableSection batchId={batchId} query={query} />
            </Suspense>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {finished && <WhyCard motivos={batch.motivos_contagem} />}
          <HistoryList history={history} />
        </div>
      </div>
    </div>
  );
}
