"use client";

import { useId, type JSX } from "react";

import { ApproveButton } from "@/features/panel-fila/components/approve-button";
import { BlockDialog } from "@/features/panel-fila/components/block-dialog";
import { DecideError } from "@/features/panel-fila/components/decide-error";
import { useFila } from "@/features/panel-fila/components/fila-provider";
import { RequestDocumentsDialog } from "@/features/panel-fila/components/request-documents-dialog";
import { globalCopy } from "@/features/panel-shell/copy/global";
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
 * dialogs; T112 makes it a sticky bar below lg. Offline (T111, D8) every
 * decision is disabled and described by offline.actions, shown in text.
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
  const off = online
    ? undefined
    : ({ disabled: true, describedBy: offlineId } as const);
  return (
    <div className="flex flex-col gap-2">
      <DecideError caseId={caseId} />
      {!online && (
        <p id={offlineId} className="text-secondary text-ink-muted">
          {globalCopy["offline.actions"]}
        </p>
      )}
      <div data-case-actions className="flex flex-wrap gap-2">
        <ApproveButton
          caseId={caseId}
          decisao={origem === "monitoramento" ? "manter" : "aprovar"}
          razao={razao}
          offline={off}
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
    </div>
  );
}
