"use client";

import type { JSX } from "react";

import { ApproveButton } from "@/features/panel-fila/components/approve-button";
import { BlockDialog } from "@/features/panel-fila/components/block-dialog";
import { DecideError } from "@/features/panel-fila/components/decide-error";
import type { CaseOrigem } from "@/lib/panel-api-values";

type Props = {
  caseId: string;
  origem: CaseOrigem;
  /** The razão social, or the masked CNPJ (G3). */
  razao: string;
  /** /me's webhook_configurado (Bloquear's lead). */
  webhook: boolean;
};

/**
 * The open case's decisions (spec S6), owned by /fila/[caseId] only
 * (ADR-0008 Addendum 2): the page renders it for undecided cases, so /fila
 * never imports decideAction (F7). A failed decision's alert sits above
 * the buttons (T106). Bloquear is a dialog (T107); Pedir documento arrives
 * with T108; T112 makes it a sticky bar below lg.
 */
export function CaseActions({
  caseId,
  origem,
  razao,
  webhook,
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
        <BlockDialog caseId={caseId} razao={razao} webhook={webhook} />
      </div>
    </div>
  );
}
