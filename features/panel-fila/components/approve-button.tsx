"use client";

import type { JSX } from "react";

import { Button } from "@/components/ui/button";
import { filaCopy } from "@/features/panel-fila/copy";
import { useDecide, type QuickDecisao } from "@/features/panel-fila/use-decide";

type Props = {
  caseId: string;
  decisao: QuickDecisao;
  /** The toast's {razao_social}: the masked CNPJ when there is none (G3). */
  razao: string;
};

/** fila.action.approve, or .keep on an alert: one click, no confirmation (AC 31). */
export function ApproveButton({ caseId, decisao, razao }: Props): JSX.Element {
  const { decide, busy } = useDecide();
  return (
    <Button
      type="button"
      busy={busy}
      onClick={() => decide(caseId, decisao, razao)}
    >
      {
        filaCopy[
          decisao === "manter" ? "fila.action.keep" : "fila.action.approve"
        ]
      }
    </Button>
  );
}
