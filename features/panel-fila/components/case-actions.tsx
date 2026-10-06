"use client";

import type { JSX } from "react";

import { ApproveButton } from "@/features/panel-fila/components/approve-button";
import { BlockDialog } from "@/features/panel-fila/components/block-dialog";
import { DecideError } from "@/features/panel-fila/components/decide-error";
import { RequestDocumentsDialog } from "@/features/panel-fila/components/request-documents-dialog";
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
 * dialogs; T112 makes it a sticky bar below lg.
 */
export function CaseActions({
  caseId,
  origem,
  razao,
  webhook,
  request,
}: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <DecideError caseId={caseId} />
      <div data-case-actions className="flex flex-wrap gap-2">
        <ApproveButton
          caseId={caseId}
          decisao={origem === "monitoramento" ? "manter" : "aprovar"}
          razao={razao}
        />
        {request && (
          <RequestDocumentsDialog
            caseId={caseId}
            razao={razao}
            tipos={request.tipos}
            vendedorTemEmail={request.vendedorTemEmail}
          />
        )}
        <BlockDialog caseId={caseId} razao={razao} webhook={webhook} />
      </div>
    </div>
  );
}
