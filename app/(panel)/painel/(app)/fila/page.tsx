import type { Metadata } from "next";
import { Suspense, type JSX } from "react";

import { CaseListSection } from "@/features/panel-fila/components/case-list-section";
import { DetailSkeleton } from "@/features/panel-fila/components/detail-skeleton";
import { FilaScreen } from "@/features/panel-fila/components/fila-screen";
import { ListSkeleton } from "@/features/panel-fila/components/list-skeleton";
import { filaCopy } from "@/features/panel-fila/copy";
import { requireSession } from "@/lib/api/panel/session";
import { contratarHref } from "@/lib/panel-config";

export const metadata: Metadata = { title: filaCopy["fila.h1"] };

// /fila: the list; at lg the detail pane waits for a case (T98, T99). /me is
// the layout's read (React cache(), one request).
export default async function FilaPage(): Promise<JSX.Element> {
  const me = await requireSession();
  return (
    <FilaScreen
      contagens={me.workspace.contagens}
      plano={me.workspace.plano}
      contratarHref={contratarHref()}
      caseOpen={false}
      list={
        <Suspense fallback={<ListSkeleton />}>
          <CaseListSection />
        </Suspense>
      }
      detail={<DetailSkeleton />}
    />
  );
}
