import type { Metadata } from "next";
import type { JSX } from "react";

import { BatchState } from "@/features/panel-lote/components/batch-state";
import { HistoryList } from "@/features/panel-lote/components/history-list";
import { loteCopy } from "@/features/panel-lote/copy";
import { batchOrExit, historyOrError } from "@/features/panel-lote/data";
import { requireSession } from "@/lib/api/panel/session";

export const metadata: Metadata = { title: loteCopy["lote.h1"] };

type Props = { params: Promise<{ batchId: string }> };

// A batch (S7): its state from D-B2, then the history (plan M5 tree).
export default async function BatchPage({
  params,
}: Props): Promise<JSX.Element> {
  const { batchId } = await params;
  await requireSession();
  const batch = await batchOrExit(batchId);
  const history = await historyOrError();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-title font-title text-ink">{loteCopy["lote.h1"]}</h1>
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <BatchState batch={batch} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <HistoryList history={history} />
        </div>
      </div>
    </div>
  );
}
