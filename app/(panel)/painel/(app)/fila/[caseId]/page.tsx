import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type JSX } from "react";

import { BackLink } from "@/features/panel-fila/components/back-link";
import { CaseActions } from "@/features/panel-fila/components/case-actions";
import { CaseDetail } from "@/features/panel-fila/components/case-detail";
import { CaseDetailError } from "@/features/panel-fila/components/case-detail-error";
import { CaseList } from "@/features/panel-fila/components/case-list";
import { DetailPane } from "@/features/panel-fila/components/detail-pane";
import { FilaScreen } from "@/features/panel-fila/components/fila-screen";
import { FilaTabs } from "@/features/panel-fila/components/fila-tabs";
import { ListSkeleton } from "@/features/panel-fila/components/list-skeleton";
import { filaCopy } from "@/features/panel-fila/copy";
import { documentsSettings } from "@/features/panel-fila/document-route";
import { parseFilaSearch } from "@/features/panel-fila/search-params";
import { getCaseForPage } from "@/lib/api/panel/cases";
import { AppError } from "@/lib/api/errors";
import { requireSession } from "@/lib/api/panel/session";
import { isPanelId } from "@/lib/panel-api-values";
import { contratarHref } from "@/lib/panel-config";

export const metadata: Metadata = { title: filaCopy["fila.h1"] };

type Props = {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// /fila/{id}: an id outside A-X3 is not found with no API call; an unknown or
// foreign one (PC9) gets the same not found. The case is read before anything
// streams, so the 404 is a real 404 (no loading.tsx above it). The list pane
// streams its own skeleton.
export default async function CasePage({
  params,
  searchParams,
}: Props): Promise<JSX.Element> {
  const { caseId } = await params;
  if (!isPanelId(caseId)) notFound();
  const search = parseFilaSearch(await searchParams);
  const me = await requireSession();
  const result = await getCaseForPage(caseId).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "CASO_NAO_ENCONTRADO")
      notFound();
    throw error;
  });

  return (
    <FilaScreen
      contagens={me.workspace.contagens}
      plano={me.workspace.plano}
      contratarHref={contratarHref()}
      caseOpen
      list={
        <>
          <FilaTabs aba={search.aba} contagens={me.workspace.contagens} />
          <Suspense fallback={<ListSkeleton />}>
            <CaseList {...search} selectedId={caseId} />
          </Suspense>
        </>
      }
      detail={
        <DetailPane caseId={caseId}>
          <div className="flex flex-col gap-4">
            <BackLink
              search={search}
              always={result.ok && result.case.estado === "decidido"}
            />
            {result.ok ? (
              <>
                <CaseDetail
                  view={result.case}
                  now={new Date()}
                  documentsMode={documentsSettings().mode}
                />
                {/* The only owner of decideAction (ADR-0008 Addendum 2, F7). */}
                {result.case.estado !== "decidido" && (
                  <CaseActions
                    caseId={result.case.id}
                    origem={result.case.origem}
                    razao={result.case.razao_social ?? result.case.cnpj}
                  />
                )}
              </>
            ) : (
              <CaseDetailError />
            )}
          </div>
        </DetailPane>
      }
    />
  );
}
