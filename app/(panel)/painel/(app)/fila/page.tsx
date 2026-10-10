import type { Metadata } from "next";
import { Suspense, type JSX } from "react";

import { CaseList } from "@/features/panel-fila/components/case-list";
import { DetailPane } from "@/features/panel-fila/components/detail-pane";
import { DetailSkeleton } from "@/features/panel-fila/components/detail-skeleton";
import { FilaScreen } from "@/features/panel-fila/components/fila-screen";
import { FilaTabs } from "@/features/panel-fila/components/fila-tabs";
import { IdleDetail } from "@/features/panel-fila/components/idle-detail";
import { ListSkeleton } from "@/features/panel-fila/components/list-skeleton";
import { NewCasesNotice } from "@/features/panel-fila/components/new-cases-notice";
import { filaCopy } from "@/features/panel-fila/copy";
import { parseFilaSearch } from "@/features/panel-fila/search-params";
import { requireSession } from "@/lib/api/panel/session";
import { contratarHref } from "@/lib/panel-config";

export const metadata: Metadata = { title: filaCopy["fila.h1"] };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// /fila: the tabs and the list (?aba=, ?ate=, plan D2); at lg the detail pane
// opens the oldest case (D4) or holds the empty message. /me is the layout's
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
          <NewCasesNotice aba={search.aba} />
          <Suspense fallback={<ListSkeleton />}>
            <CaseList {...search} selectedId={null} />
          </Suspense>
        </>
      }
      detail={
        <DetailPane caseId={null}>
          <Suspense fallback={<DetailSkeleton />}>
            <IdleDetail {...search} />
          </Suspense>
        </DetailPane>
      }
    />
  );
}
