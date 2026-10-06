import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type JSX } from "react";

import { CaseListSection } from "@/features/panel-fila/components/case-list-section";
import { FilaScreen } from "@/features/panel-fila/components/fila-screen";
import { ListSkeleton } from "@/features/panel-fila/components/list-skeleton";
import { filaCopy } from "@/features/panel-fila/copy";
import { getCaseForPage } from "@/lib/api/panel/cases";
import { AppError } from "@/lib/api/errors";
import { requireSession } from "@/lib/api/panel/session";
import { isPanelId } from "@/lib/panel-api-values";
import { contratarHref } from "@/lib/panel-config";

export const metadata: Metadata = { title: filaCopy["fila.h1"] };

type Props = { params: Promise<{ caseId: string }> };

// /fila/{id}: an id outside A-X3 is not found with no API call; an unknown or
// foreign one (PC9) gets the same not found. The case is read before anything
// streams, so the 404 is a real 404 (no loading.tsx above it). The list pane
// streams its own skeleton.
export default async function CasePage({
  params,
}: Props): Promise<JSX.Element> {
  const { caseId } = await params;
  if (!isPanelId(caseId)) notFound();
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
        <Suspense fallback={<ListSkeleton />}>
          <CaseListSection />
        </Suspense>
      }
      detail={
        // T100/T101 build the detail; T97 names the case.
        result.ok ? (
          <h2 className="text-h2 font-title text-ink">
            {result.case.razao_social ?? result.case.cnpj}
          </h2>
        ) : (
          <p className="text-body text-ink">{filaCopy["fila.detail.error"]}</p>
        )
      }
    />
  );
}
