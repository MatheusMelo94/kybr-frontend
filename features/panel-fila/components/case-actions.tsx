"use client";

import { useId, useRef, type JSX } from "react";

import { ApproveButton } from "@/features/panel-fila/components/approve-button";
import { BlockDialog } from "@/features/panel-fila/components/block-dialog";
import { DecideError } from "@/features/panel-fila/components/decide-error";
import { useFila } from "@/features/panel-fila/components/fila-provider";
import { RequestDocumentsDialog } from "@/features/panel-fila/components/request-documents-dialog";
import { useStickyBar } from "@/features/panel-fila/use-sticky-bar";
import { globalCopy } from "@/features/panel-shell/copy/global";
import { cn } from "@/lib/utils";
import type { CaseOrigem, DocumentoTipo } from "@/lib/panel-api-values";

type Props = {
  caseId: string;
  origem: CaseOrigem;
  /** The razão social, or the masked CNPJ (G3). */
  razao: string;
  /** /me's webhook_configurado (Bloquear's lead). */
  webhook: boolean;
  /**
   * Pedir documento's inputs: /me's documentos_habilitados and the case's
   * vendedor_tem_email. Without enabled types there is nothing to offer.
   */
  request?:
    { tipos: readonly DocumentoTipo[]; vendedorTemEmail: boolean } | undefined;
};

/**
 * The open case's decisions (spec S6), owned by /fila/[caseId] only
 * (ADR-0008 Addendum 2): the page renders it for undecided cases, so /fila
 * never imports decideAction (F7). A failed decision's alert sits above
 * the buttons (T106). Pedir documento (T108) and Bloquear (T107) are
 * dialogs. Offline (T111, D8) every decision is disabled and described by
 * offline.actions, shown in text.
 *
 * Below lg (T112, AC 43) the buttons are a sticky bottom bar: the primary
 * full width, then Pedir documento | Bloquear, padded by the safe-area
 * inset. The alert and the offline line stay above it, outside it (QA
 * A34-07, OF-08). The bar is a sibling of the detail's blocks, not inside a
 * wrapper, so its sticky range is the whole detail column.
 */
export function CaseActions({
  caseId,
  origem,
  razao,
  webhook,
  request,
}: Props): JSX.Element {
  const { online } = useFila();
  const offlineId = useId();
  const bar = useRef<HTMLDivElement>(null);
  const sticky = useStickyBar(bar);
  const off = online
    ? undefined
    : ({ disabled: true, describedBy: offlineId } as const);
  return (
    <>
      <DecideError caseId={caseId} />
      {!online && (
        <p id={offlineId} className="text-secondary text-ink-muted">
          {globalCopy["offline.actions"]}
        </p>
      )}
      <div
        ref={bar}
        data-case-actions
        data-sticky={sticky}
        className={cn(
          "flex flex-wrap gap-2",
          "max-lg:-mx-4 max-lg:grid max-lg:border-t max-lg:border-line max-lg:bg-surface max-lg:px-4 max-lg:pt-3",
          "max-lg:pb-[calc(--spacing(3)+env(safe-area-inset-bottom))]",
          request && "max-lg:grid-cols-2",
          sticky && "max-lg:sticky max-lg:bottom-0",
        )}
      >
        <ApproveButton
          caseId={caseId}
          decisao={origem === "monitoramento" ? "manter" : "aprovar"}
          razao={razao}
          offline={off}
          className="max-lg:col-span-2"
        />
        {request && (
          <RequestDocumentsDialog
            caseId={caseId}
            razao={razao}
            tipos={request.tipos}
            vendedorTemEmail={request.vendedorTemEmail}
            offline={off}
          />
        )}
        <BlockDialog
          caseId={caseId}
          razao={razao}
          webhook={webhook}
          offline={off}
        />
      </div>
    </>
  );
}
