import type { Metadata } from "next";
import { Suspense, type JSX } from "react";

import { CaseList } from "@/features/panel-fila/components/case-list";
import { DetailSkeleton } from "@/features/panel-fila/components/detail-skeleton";
import { FilaScreen } from "@/features/panel-fila/components/fila-screen";
import { FilaTabs } from "@/features/panel-fila/components/fila-tabs";
import { IdleDetail } from "@/features/panel-fila/components/idle-detail";
import { ListSkeleton } from "@/features/panel-fila/components/list-skeleton";
import { filaCopy } from "@/features/panel-fila/copy";
import { parseFilaSearch } from "@/features/panel-fila/search-params";
import { requireSession } from "@/lib/api/panel/session";
import { contratarHref } from "@/lib/panel-config";

export const metadata: Metadata = { title: filaCopy["fila.h1"] };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// /fila: the tabs and the list (?aba=, ?ate=, plan D2); at lg the detail pane
// waits for a case (T99) or holds the empty message. /me is the layout's
// read (React cache(), one request).
export default async function FilaPage({
  searchParams,
}: Props): Promise<JSX.Element> {
  const search = parseFilaSearch(await searchParams);
  const me = await requireSession();
  return (
    <FilaScreen
      contagens={me.workspace.contagens}
      plano={me.workspace.plano}
      contratarHref={contratarHref()}
      caseOpen={false}
      list={
        <>
          <FilaTabs aba={search.aba} contagens={me.workspace.contagens} />
          <Suspense fallback={<ListSkeleton />}>
            <CaseList {...search} selectedId={null} />
          </Suspense>
        </>
      }
      detail={
        <Suspense fallback={<DetailSkeleton />}>
          <IdleDetail {...search} />
        </Suspense>
      }
    />
  );
}
