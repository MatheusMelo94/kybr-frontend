import type { JSX } from "react";

import { ResultTable } from "@/features/panel-lote/components/result-table";
import { StatusFilter } from "@/features/panel-lote/components/status-filter";
import { TablePager } from "@/features/panel-lote/components/table-pager";
import {
  rowsFilter,
  rowsPage,
  type RowsQuery,
} from "@/features/panel-lote/data";

type Props = { batchId: string; query: RowsQuery };

/** The result table's section (T83): the filter, 25 rows and the pager, from the URL's query. */
export async function ResultTableSection({
  batchId,
  query,
}: Props): Promise<JSX.Element> {
  const filter = rowsFilter(query);
  const page = await rowsPage(batchId, query);
  return (
    <div className="flex flex-col gap-3">
      <StatusFilter status={filter.status} />
      <ResultTable page={page} />
      <TablePager
        base={`/lote/${batchId}`}
        status={filter.status}
        cursor={filter.cursor}
        next={page.proximo_cursor}
      />
    </div>
  );
}
